'use strict';

const es = require('elasticsearch'),
      esConf = require('co-config/es.js'),
      _ = require('lodash'),
      metadata = require('co-config/mapping-shingles.json'),
      baseRequest = require('co-config/base_request.json'),
      debug = require('debug')('co-deduplicate'),
      Promise = require('bluebird');

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

  getRequest(docObject){
    return Promise.try(()=>{
      let query='';
      let shingleField='';
      let mapping=_.get(metadata,'mappings.record.properties',{});
      _.mapKeys(mapping,(value,key)=>{
        if (_.get(value,'copy_to','')!=='') {
          shingleField+=_.get(docObject,key,'');
          //shingleField+=_.get(docObject,key+'.value','');
        }
      });

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
      if (hit._source.idConditor===docObject.idConditor){
        recordId = hit._id;
      }
    });

    if (recordId===undefined) { throw new Error("la notice ne s'est pas trouvée."); }

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
    if (arrayNearDuplicate.length>0) {docObject.isNearDuplicate = true;}

    return esClient.update({
      index:esConf.index,
      type:esConf.type,
      id:recordId,
      body:{
        doc:{
          isNearDuplicate:docObject.isNearDuplicate,
          nearDuplicate:arrayNearDuplicate
        }
      }
    });
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

  finalJob(docObject,cb){
    cb();
  }
}

module.exports = new CoSimilarity();