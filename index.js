'use strict';

const es = require('elasticsearch');
const esConf = require('co-config/es.js');
const _ = require('lodash');
const metadata = require('co-config/mapping.json');
const debug = require('debug')('co-similarity');
const Promise = require('bluebird');
const docsToBeUpdated = {};
const bulkUpdates = { body: [] };
const idConditorToIdElastic = {};
const docObjectsIdsForInitialization = {};
const esClient = new es.Client({
  host: esConf.host,
  log: {
    type: 'file',
    level: ['error']
  }
});

class CoSimilarity {
  constructor () {
    this.CONDITOR_SESSION = process.env.ISTEX_SESSION || 'TEST_1970-01-01-00-00-00';
    this.MODULEROOT = process.env.MODULEROOT || __dirname;
  }

  getShingleString (docObject) {
    let shingleField = '';
    let mapping = _.get(metadata, 'mappings.record.properties', {});
    for (const fieldName of Object.keys(mapping)) {
      const hasCopyTo = mapping[fieldName]['copy_to'] === 'fingerprint';
      if (hasCopyTo && docObject[fieldName]) { shingleField += ' ' + docObject[fieldName]; }
      // Need to be refactored to be generic and search anywhere in mapping tree
      if (mapping[fieldName].properties) {
        for (const subFieldName of Object.keys(mapping[fieldName].properties)) {
          if (mapping[fieldName].properties[subFieldName]['copy_to'] === 'fingerprint' && docObject[fieldName][subFieldName] && docObject[fieldName][subFieldName] !== '') { shingleField += ' ' + docObject[fieldName][subFieldName]; }
        }
      }
    }
    return shingleField.substring(1);
  }

  getRequest (docObject) {
    return Promise.try(() => {
      let query = '';
      const shingleField = this.getShingleString(docObject);
      query = {
        'query': {
          'bool': {
            'must': {
              'match': {
                'fingerprint': shingleField
              }
            }
          }
        }
      };

      return query;
    });
  }

  getScore (docObject, request) {
    let response = esClient.search({
      index: esConf.index,
      body: request,
      size: 100
    });
    return response;
  }

  getSimilarity (docObject) {
    return this.getRequest(docObject).then(this.getScore.bind(this, docObject));
  }

  insertScore (docObject, result) {
    const threshold = 80 / 100;
    docObject.maxScore = result.hits.max_score;
    docObject.minLimit = docObject.maxScore * threshold;

    let recordId;
    _.each(result.hits.hits, (hit) => {
      idConditorToIdElastic[hit._source.idConditor] = hit._id;
      if (hit._source.idConditor === docObject.idConditor) {
        recordId = hit._id;
        if (!docObject.nearDuplicates || (Array.isArray(docObject.nearDuplicates) && docObject.nearDuplicates.length === 0)) { docObjectsIdsForInitialization[docObject.idConditor] = hit._id; }
      }
    });

    if (recordId === undefined) { throw new Error("la notice ne s'est pas trouvée."); }

    // retrieve every duplicates with a score greater than minLimit
    let arrayNearDuplicate = _.map(result.hits.hits, (hit) => {
      const similarityRate = (docObject.maxScore === 0) ? 0 : _.round(hit._score / docObject.maxScore, 4);
      if (similarityRate >= threshold && hit._source.idConditor !== docObject.idConditor && _.includes(hit._source.typeConditor, docObject.typeConditor)) {
        return {
          similarityRate,
          idConditor: hit._source.idConditor,
          type: docObject.typeConditor,
          source: hit._source.source
        };
      }
    });

    arrayNearDuplicate = _.compact(arrayNearDuplicate);

    docObject.nearDuplicates = arrayNearDuplicate;
    docObject.isNearDuplicate = false;
    if (arrayNearDuplicate.length > 0) docObject.isNearDuplicate = true;
    for (let nearDuplicates of arrayNearDuplicate) {
      // update of docObjects are stored: bulk will be done by finalJob()
      this.addDuplicate(docObject, nearDuplicates);
      debug(docsToBeUpdated);
    }
  }

  /*
    Adding in-memory information about nearDuplicates
    Resulting variable docsToBeUpdated will have the following structure :
    id1 : [
      {idConditor : id2,
      similarityRate : 0.9,
      type ...},...
    ],
    id2 : [
      {idConditor : id1
      duplicateBySymmetry:true,
      type...},...
    ]
  */
  addDuplicate (docObject, dup) {
    // normal link
    if (!docsToBeUpdated[docObject.idConditor]) {
      docsToBeUpdated[docObject.idConditor] = [dup];
    } else {
      const duplicatesOfSource = docsToBeUpdated[docObject.idConditor];
      let alreadyHere = false;
      let duplicateAlreadyDetected = null;
      _.each(duplicatesOfSource, (d) => {
        if (d.idConditor === dup.idConditor) {
          alreadyHere = true;
          duplicateAlreadyDetected = d;
          return false;
        }
      });
      if (!alreadyHere) {
        docsToBeUpdated[docObject.idConditor].push(dup);
      } else if (alreadyHere && duplicateAlreadyDetected.duplicateBySymmetry) {
        delete duplicateAlreadyDetected.duplicateBySymmetry;
        duplicateAlreadyDetected.similarityRate = dup.similarityRate;
        duplicateAlreadyDetected.type = dup.type;
      }
    }
    // symmetric link
    if (!docsToBeUpdated[dup.idConditor]) {
      docsToBeUpdated[dup.idConditor] = [{ idConditor: docObject.idConditor, duplicateBySymmetry: true, type: docObject.typeConditor, source: docObject.source }];
    } else {
      const duplicatesOfTarget = docsToBeUpdated[dup.idConditor];
      let alreadyHere = false;
      _.each(duplicatesOfTarget, (d) => {
        if (d.idConditor === docObject.idConditor) {
          alreadyHere = true;
          return false;
        }
      });
      if (!alreadyHere) {
        docsToBeUpdated[dup.idConditor].push({ idConditor: docObject.idConditor, duplicateBySymmetry: true, type: docObject.typeConditor, source: docObject.source });
      }
    }
  }

  doTheJob (docObject, cb) {
    let error;

    this.getSimilarity(docObject)
      .then(this.insertScore.bind(this, docObject))
      .then(() => {
        cb();
      })
      .catch(function (e) {
        error = {
          errCode: 3,
          errMessage: 'erreur de récupération de similarités : ' + e
        };
        docObject.error = error;
        cb(error);
      });
  }

  finalJob (docObjects, cb) {
    // build the bulk array for docsToBeUpdated content, filled by doTheJob calls
    for (let idConditor of Object.keys(docObjectsIdsForInitialization)) {
      bulkUpdates.body.push({ update: { _index: esConf.index, _type: esConf.type, _id: docObjectsIdsForInitialization[idConditor] } });
      bulkUpdates.body.push({ doc: { isNearDuplicate: false, nearDuplicates: [] } });
    }
    for (let idConditor of Object.keys(docsToBeUpdated)) {
      if (idConditorToIdElastic[idConditor]) {
        const nearDuplicates = docsToBeUpdated[idConditor];
        bulkUpdates.body.push({ update: { _index: esConf.index, _type: esConf.type, _id: idConditorToIdElastic[idConditor] } });
        bulkUpdates.body.push({ doc: { isNearDuplicate: true, nearDuplicates: nearDuplicates } });
      }
    }
    // make Elasticsearch execute bulk
    if (bulkUpdates.body.length > 1) {
      esClient.bulk(bulkUpdates, function (err, resp) {
        if (err) {
          cb({
            errCode: 4,
            errMessage: 'erreur de mise à jour des docObjects avec infos de similarité : ' + err
          });
        } else cb();
      });
      cb();
    } else cb();
  }
}

module.exports = new CoSimilarity();
