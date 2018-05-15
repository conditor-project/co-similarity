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
      body:request
    });
    return response;
  }

  getSimilarity(docObject){
    return this.getRequest(docObject).then(this.getScore.bind(this,docObject));
  }

  insertScore(docObject,result){

    let maxScore = result.hits.max_score;
    docObject.maxScore = maxScore
    let minLimit = maxScore*90/100;
    docObject.minLimit = minLimit;

    let recordId;
    _.each(result.hits.hits,(hit)=>{
      if (hit._source.idConditor===docObject.idConditor){
        recordId = hit._id;
      }
    });

    let arrayNearDuplicate = _.map(result.hits.hits,(hit)=>{
      if ((hit._score>=minLimit || hit.score>200) && hit._source.idConditor!==docObject.idConditor && _.union(hit._source.typeConditor,docObject.typeConditor).length>0){
        return {
          score : hit._score,
          idConditor : hit._source.idConditor,
        }
      }
    });

    arrayNearDuplicate = _.compact(arrayNearDuplicate);

    docObject.nearDuplicate = arrayNearDuplicate;

    return esClient.update({
      index:esConf.index,
      type:esConf.type,
      id:recordId,
      body:{
        doc:{
          nearDuplicate:arrayNearDuplicate
        }
      }
    });
  }

  doTheJob(docObject, cb) {
    let error;

    this.getSimilarity(docObject)
    .then(this.insertScore.bind(this,docObject))
    .catch(function(e){
        error = {
            errCode: 3,
            errMessage: 'erreur de récupération de similarités : ' + e
        };
        docObject.error = error;
        cb(error);
    })
    .then(()=>{
      cb();
    })
  }

  finalJob(docObject,cb){
    cb();
  }
}

module.exports = new CoSimilarity();