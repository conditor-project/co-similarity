'use strict';
/* eslint-env mocha */
/* eslint-disable no-unused-expressions */

const pkg = require('../package.json');
const rewire = require('rewire');
const Promise = require('bluebird');
const coSimilarity = rewire('../index-new');
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
  describe('getShingleString()', function () {
    it('should return a shingle string', function () {
      const shingleString = coSimilarity.__get__('getShingleString')(testData[0]);
      expect(shingleString).to.be.a('string');
      expect(shingleString).to.equal("COMMENGES Hadrien PISTRE Pierre Visualisation graphique agrégée des trajectoires individuelles : revue de l'existant et application en géographie Visualisation graphique agrégée des trajectoires individuelles : revue de l'existant et application en géographie M@ppemonde Longitudinal data are an important part of statistics in the social sciences. Demography has developed specific graphic visualization for these date but their use remains residual for the analysis of spatial dynamics. After a review of these graphic displays using a toy dataset, the paper proposes an original mode of visualization called 'slide plot' conceived to study trajectories of individuals or spatial units. Its use is illustrated with three examples: residential mobility, changes of modal choice in transportation, dynamics of spatial mismatch.")
    });
  });

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

    it('should do the job', function () {
      return Promise.mapSeries(testData, data => {
        return new Promise((resolve, reject) => {
          coSimilarity.doTheJob(data, (error) => {
            if (error) return reject(error);
            resolve();
          });
        });
      });
    });

    after(function () {
      return elasticsearchClient.indices.delete({
        index: elasticsearchConf.index
      });
    });
  });
});
