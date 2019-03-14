'use strict';
const metadata = require('co-config/mapping.json');
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
  console.log(docObject.idConditor);
  elasticsearchClient.search({
    index: elasticsearchConf.index,
    body: query,
    size: 50
  }).then(result => {
    const recordScore = result.hits.hits.filter(hit => hit._source.idConditor === docObject.idConditor).pop()._score;
    const thresholdCeil = recordScore * 1.8;
    const thresholdFloor = recordScore * 0.8;
    console.log(thresholdFloor, thresholdCeil);
    result.hits.hits.map((hit, index) => {
      console.log(index);
      if (index === 0) return console.log('score :', hit._score);
      const b = result.hits.hits[index - 1]._score;
      const a = (hit._score - b) / index;
      console.log('score :', hit._score);
      console.log('a :', a);
      console.log('b :', b);
    });
    next();
  }).catch(console.error);
};

module.exports = CoSimilarity;

function getShingleString (docObject) {
  let shingles = [];
  let mapping = _.get(metadata, 'mappings.record.properties', {});
  Object.keys(mapping).map(fieldName => {
    const value = mapping[fieldName];
    const pathToCopyTo = getPath(value, 'copy_to');
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

function getPath (obj, keyToSearch) {
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
