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
      const docObjectWhitNearDuplicates = testData[0];
      return new Promise((resolve, reject) => {
        coSimilarity.doTheJob(docObjectWhitNearDuplicates, (error) => {
          if (error) return reject(error);
          resolve();
        });
      }).then(() => {
        return elasticsearchClient.get({
          index: elasticsearchConf.index,
          type: Object.keys(mapping.mappings).pop(),
          id: docObjectWhitNearDuplicates.idConditor
        });
      }).then(result => {
        const doc = result._source;
        expect(doc).to.have.property('nearDuplicates');
        expect(doc.nearDuplicates).to.be.an('array');
        expect(doc.nearDuplicates).to.have.lengthOf(1);
        const nearDuplicate = doc.nearDuplicates.pop();
        expect(nearDuplicate).to.have.property('similarityRate');
        expect(nearDuplicate.similarityRate).to.equal(1);
        expect(nearDuplicate).to.have.property('source');
        expect(nearDuplicate.source).to.equal('hal');
        expect(nearDuplicate).to.have.property('type');
        expect(nearDuplicate.type).to.equal('Article');
        expect(nearDuplicate).to.have.property('idConditor');
        expect(nearDuplicate.idConditor).to.equal('HXHT4r9y_THTaXSKdIb7NKBIO');
      });
    });

    it('should find no nearDuplicates', function () {
      const docObjectWhithoutNearDuplicates = testData[1];
      return new Promise((resolve, reject) => {
        coSimilarity.doTheJob(docObjectWhithoutNearDuplicates, (error) => {
          if (error) return reject(error);
          resolve();
        });
      }).then(() => {
        return elasticsearchClient.get({
          index: elasticsearchConf.index,
          type: Object.keys(mapping.mappings).pop(),
          id: docObjectWhithoutNearDuplicates.idConditor
        });
      }).then(result => {
        const doc = result._source;
        expect(doc).to.have.property('nearDuplicates');
        expect(doc.nearDuplicates).to.be.an('array');
        expect(doc.nearDuplicates).to.be.empty;
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
      const shingleString = coSimilarity.__get__('getShingleString')(testData[0]);
      expect(shingleString).to.be.a('string');
      expect(shingleString).to.equal("COMMENGES Hadrien PISTRE Pierre Visualisation graphique agrégée des trajectoires individuelles : revue de l'existant et application en géographie Visualisation graphique agrégée des trajectoires individuelles : revue de l'existant et application en géographie M@ppemonde Longitudinal data are an important part of statistics in the social sciences. Demography has developed specific graphic visualization for these date but their use remains residual for the analysis of spatial dynamics. After a review of these graphic displays using a toy dataset, the paper proposes an original mode of visualization called 'slide plot' conceived to study trajectories of individuals or spatial units. Its use is illustrated with three examples: residential mobility, changes of modal choice in transportation, dynamics of spatial mismatch.")
    });
  });
});
