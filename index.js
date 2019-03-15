'use strict';
const metadata = require('co-config/mapping.json');
const mapping = require('co-config/mapping.json');
const _ = require('lodash');
const elasticsearch = require('elasticsearch');
const elasticsearchConf = require('co-config/es.js');
const elasticsearchClient = new elasticsearch.Client({
  host: elasticsearchConf.host
});

const CoSimilarity = {
  CONDITOR_SESSION: process.env.ISTEX_SESSION || 'TEST_1970-01-01-00-00-00',
  MODULEROOT: process.env.MODULEROOT || __dirname
};

CoSimilarity.doTheJob = function (docObject, next) {
  const shingleString = getShingleString(docObject);
  const query = {
    'query': {
      'bool': {
        'must': {
          'match': {
            'fingerprint': shingleString
          }
        }
      }
    }
  };
  elasticsearchClient.search({
    index: elasticsearchConf.index,
    body: query,
    size: 50
  }).then(result => {
    const recordWithMaxScoreDelta = result.hits.hits.map((hit, index, hits) => {
      hit.scoreDelta = (index === 0) ? 0 : (hits[index - 1]._score - hit._score);
      return hit;
    }).sort((a, b) => a.scoreDelta - b.scoreDelta).pop();
    const duplicatedIdConditor = docObject.duplicates.map(duplicate => duplicate.idConditor);
    const nearDuplicates = result.hits.hits
      .slice(0, result.hits.hits.indexOf(recordWithMaxScoreDelta))
      .filter(hit => (hit._source.idConditor !== docObject.idConditor && duplicatedIdConditor.includes(hit._source.idConditor)))
      .map(hit => {
        const similarityRate = (result.hits.max_score === 0) ? 0 : _.round(hit._score / result.hits.max_score, 4);
        return {
          similarityRate,
          idConditor: hit._source.idConditor,
          type: docObject.typeConditor,
          source: hit._source.source
        };
      });
    docObject.nearDuplicates = nearDuplicates;
    docObject.isNearDuplicate = (nearDuplicates.length > 0);
    return elasticsearchClient.update({
      index: elasticsearchConf.index,
      type: Object.keys(mapping.mappings).pop(),
      id: docObject.idConditor,
      body: {
        doc: docObject
      }
    });
  }).then(() => {
    next();
  }).catch(error => {
    docObject.error = error;
    next(error);
  });
};

module.exports = CoSimilarity;

function getShingleString (docObject) {
  let shingles = [];
  let mapping = _.get(metadata, 'mappings.record.properties', {});
  Object.keys(mapping).map(fieldName => {
    const value = mapping[fieldName];
    const pathToCopyTo = getPathOfObject(value, 'copy_to');
    if (pathToCopyTo) {
      pathToCopyTo.map(path => {
        const hasCopyTo = _.get(value, path) === 'fingerprint';
        let fieldToRecover = [fieldName];
        const pathArray = path.split('.');
        if (pathArray.length > 1) {
          const subPath = pathArray.filter(item => (item !== 'properties' && item !== 'copy_to'));
          fieldToRecover = fieldToRecover.concat(subPath);
        }
        const valueToRecover = _.get(docObject, fieldToRecover);
        if (hasCopyTo && valueToRecover) {
          shingles.push(valueToRecover);
        }
      });
    }
  });
  return shingles.join(' ');
}

function getPathOfObject (obj, keyToSearch) {
  const result = [];
  findKey(obj, keyToSearch, []);
  return result.length > 0 ? result : undefined;
  function findKey (obj, keyToSearch, actualPath) {
    Object.keys(obj).map(key => {
      if (key === keyToSearch) {
        const path = [...actualPath, key];
        result.push(path.join('.'));
      }
      if (obj[key] && typeof obj[key] === 'object') {
        findKey(obj[key], keyToSearch, [...actualPath, key]);
      }
    });
  }
}
