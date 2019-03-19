'use strict';
/* eslint-env mocha */
/* eslint-disable no-unused-expressions */

const pkg = require('../package.json');
const rewire = require('rewire');
const Promise = require('bluebird');
const coSimilarity = rewire('../index');
const elasticsearch = require('elasticsearch');
const elasticsearchConf = require('co-config/es.js');
const { expect } = require('chai');
const testData = require('./dataset/data.json');
const mapping = require('co-config/mapping.json');
elasticsearchConf.index = `test-${Date.now()}`;
coSimilarity.__set__('elasticsearchConf.index', elasticsearchConf.index);

const elasticsearchClient = new elasticsearch.Client({
  host: elasticsearchConf.host
});

describe(`${pkg.name}/index.js`, function () {
  describe('DoTheJob()', function () {
    this.timeout(10000);
    before(function () {
      return elasticsearchClient.indices.create({
        index: elasticsearchConf.index,
        body: mapping
      }).then(() => {
        return Promise.map(testData, data => {
          return elasticsearchClient.create({
            index: elasticsearchConf.index,
            type: Object.keys(mapping.mappings).pop(),
            id: data.idConditor,
            body: data
          });
        }).delay(1000);
      });
    });

    it('should find some nearDuplicates', function () {
      return Promise.map(testData, data => {
        return new Promise((resolve, reject) => {
          coSimilarity.doTheJob(data, (error) => {
            if (error) return reject(error);
            resolve();
          });
        }).then(() => {
          return elasticsearchClient.get({
            index: elasticsearchConf.index,
            type: Object.keys(mapping.mappings).pop(),
            id: data.idConditor
          });
        }).then(result => {
          const doc = result._source;
          expect(doc).to.have.property('nearDuplicates');
          expect(doc.nearDuplicates).to.be.an('array');
          if (doc.nearDuplicates.length > 0) {
            doc.nearDuplicates.map(nearDuplicate => {
              expect(nearDuplicate).to.have.property('similarityRate');
              expect(nearDuplicate.similarityRate).to.be.a('number');
              expect(nearDuplicate.similarityRate).to.be.above(coSimilarity.__get__('thresholdSimilarity'));
              expect(nearDuplicate).to.have.property('source');
              expect(nearDuplicate.source).to.be.a('string');
              expect(nearDuplicate).to.have.property('type');
              expect(nearDuplicate.type).to.be.a('string');
              expect(nearDuplicate).to.have.property('idConditor');
              expect(nearDuplicate.idConditor).to.be.a('string');
            });
          }
        });
      });
    });

    after(function () {
      return elasticsearchClient.indices.delete({
        index: elasticsearchConf.index
      });
    });
  });

  describe('getShingleString()', function () {
    it('should return a shingle string', function () {
      testData.map(data => {
        const shingleString = coSimilarity.__get__('getShingleString')(data);
        expect(shingleString).to.be.a('string');
        expect(shingleString.includes(data.title.default)).to.be.true;
        expect(shingleString.includes(data.first3AuthorNames)).to.be.true;
        if (data.hasOwnProperty('abstract')) expect(shingleString.includes(data.abstract)).to.be.true;
      });
    });
  });
});
