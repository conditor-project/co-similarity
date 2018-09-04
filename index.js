'use strict';

const es = require('elasticsearch'),
      esConf = require('co-config/es.js'),
      _ = require('lodash'),
      metadata = require('co-config/mapping.json'),
      baseRequest = require('co-config/base_request.json'),
      debug = require('debug')('co-similarity'),
      Promise = require('bluebird'),
      docsToBeUpdated = {},
      bulkUpdates = {body:[]},
      idConditorToIdElastic = {};

const esClient = new es.Client({
    host: esConf.host,
    log: {
        type: 'file',
        level: ['error']
    }
});

class CoSimilarity{

  constructor() {

    this.CONDITOR_SESSION = process.env.ISTEX_SESSION || "TEST_1970-01-01-00-00-00";
    this.MODULEROOT = process.env.MODULEROOT || __dirname;

  }

  getShingleString(docObject){
    let shingleField='';
    let mapping=_.get(metadata,'mappings.record.properties',{});
    for (const fieldName of Object.keys(mapping)) {
      if (mapping[fieldName]['copy_to'] === 'fingerprint' && docObject[fieldName] && docObject[fieldName] !== '')
        shingleField += ' '+docObject[fieldName];
    }
    return shingleField.substring(1);
  }

  getRequest(docObject){
    return Promise.try(()=>{
      let query='';
      const shingleField = this.getShingleString(docObject);
      
      query={"query":
              {"bool":
                {"must":
                  {"match":
                    {"fingerprint":shingleField}
                  }
                }
              }
            };
      
      return query;
    });
  }

  getScore(docObject,request){
    let response = esClient.search({
      index:esConf.index,
      body:request,
      size:100
    });
    return response;
  }

  getSimilarity(docObject){
    return this.getRequest(docObject).then(this.getScore.bind(this,docObject));
  }

  insertScore(docObject,result){

    let maxScore = result.hits.max_score;
    let total = result.hits.total;
    docObject.maxScore = maxScore
    let minLimit = maxScore*80/100;
    docObject.minLimit = minLimit;

    let recordId;
    _.each(result.hits.hits,(hit)=>{
      idConditorToIdElastic[hit._source.idConditor] = hit._id;
      if (hit._source.idConditor===docObject.idConditor){
        recordId = hit._id;
      }
    });

    if (recordId===undefined) { throw new Error("la notice ne s'est pas trouvée."); }

    // retrieve every duplicate with a score greater than minLimit
    let arrayNearDuplicate = _.map(result.hits.hits,(hit)=>{
      if (hit._score>=minLimit && hit._source.idConditor!==docObject.idConditor  && _.intersection(hit._source.typeConditor,docObject.typeConditor).length>0){
        return {
          score : hit._score,
          idConditor : hit._source.idConditor,
          type:_.intersection(hit._source.typeConditor,docObject.typeConditor)
        }
      }
    });

    arrayNearDuplicate = _.compact(arrayNearDuplicate);

    docObject.nearDuplicate = arrayNearDuplicate;
    docObject.isNearDuplicate = false;
    if (arrayNearDuplicate.length>0) docObject.isNearDuplicate = true;
    for (let nearDuplicate of arrayNearDuplicate) {
      // update of docObjects are stored: bulk will be done by finalJob()
    this.addDuplicate(docObject.idConditor,docObject.typeConditor,nearDuplicate);
      debug(docsToBeUpdated);
    }
  }

    /*
    Adding in-memory information about nearDuplicates 
    Resulting variable docsToBeUpdated will have the following structure :
    id1 : [
      {idConditor : id2,
      score : 0.9,
      type ...},...
    ],
    id2 : [
      {idConditor : id1
      duplicateBySymmetry:true,
      type...},...
    ]
  */
  addDuplicate(idSource,typeSource,dup) {
    // normal link
    if (!docsToBeUpdated[idSource] ) {
      docsToBeUpdated[idSource] = [dup];
    } else {
      const duplicatesOfSource = docsToBeUpdated[idSource];
      let alreadyHere = false;
      let duplicateAlreadyDetected = null;
      _.each(duplicatesOfSource, (d)=>{
        if (d.idConditor === dup.idConditor) {
          alreadyHere = true;
          duplicateAlreadyDetected = d;
          return false;
        }
      });
      if (!alreadyHere) {
        docsToBeUpdated[idSource].push(dup);
      } else if (alreadyHere && duplicateAlreadyDetected.duplicateBySymmetry) {
        delete duplicateAlreadyDetected.duplicateBySymmetry;
        duplicateAlreadyDetected.score = dup.score;
        duplicateAlreadyDetected.type = dup.type;
      }
    }
    // symmetric link
    if (!docsToBeUpdated[dup.idConditor] ) {
      docsToBeUpdated[dup.idConditor] = [{idConditor:idSource, duplicateBySymmetry:true,type: typeSource}];
    } else {
      const duplicatesOfTarget = docsToBeUpdated[dup.idConditor];
      let alreadyHere = false;
      _.each(duplicatesOfTarget,(d)=>{
        if (d.idConditor === idSource) {
          alreadyHere = true;
          return false;
        }
      });
      if (!alreadyHere) {
        docsToBeUpdated[dup.idConditor].push({idConditor:idSource, duplicateBySymmetry:true,type: typeSource});
      }
    }

  }

  doTheJob(docObject, cb) {
    let error;

    this.getSimilarity(docObject)
    .then(this.insertScore.bind(this,docObject))
    .then(()=>{      
      cb();
    })
    .catch(function(e){
        error = {
            errCode: 3,
            errMessage: 'erreur de récupération de similarités : ' + e
        };
        docObject.error = error;
        cb(error);
    });
    
  }

  finalJob(docObjects,cb){
    // build the bulk array for docsToBeUpdated content, filled by doTheJob calls
    for (let idConditor of Object.keys(docsToBeUpdated)) {
      if (idConditorToIdElastic[idConditor]) {
        const nearDuplicates = docsToBeUpdated[idConditor];
        bulkUpdates.body.push({update:{_index:esConf.index,_type:esConf.type,_id:idConditorToIdElastic[idConditor]}});
        bulkUpdates.body.push({doc:{isNearDuplicate:true,nearDuplicate:nearDuplicates}});
      }
    }
    // make Elasticsearch execute bulk
    if (bulkUpdates.body.length > 1) {
      esClient.bulk(bulkUpdates, function(err,resp){
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