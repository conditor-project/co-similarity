'use strict';
/* eslint-env mocha */
/* eslint-disable no-unused-expressions */

const Promise = require('bluebird');
const rewire = require('rewire');
const business = rewire('../index.js');
const testData = require('./dataset/in/test.json');
const chai = require('chai');
const expect = chai.expect;
const es = require('elasticsearch');
const spawnSync = require('child_process').spawnSync;
const eachLimit = require('async/eachLimit');
const debug = require('debug')('test');

const esConf = require('co-config/es.js');
esConf.index = 'test-records';
business.__set__('esConf.index', 'test-records')

const esClient = new es.Client({
  host: esConf.host,
  log: {
    type: 'file',
    level: ['error']
  }
});

// test sur certaines méthodes de co-similarity
describe('#test sur certaines méthodes de co-similarity', function () {
  it('devrait recalculer le bon fingerprint', function (done) {
    let docObect = testData[0];
    const shingleString = business.getShingleString(docObect);
    const expectedShingleString = 'Charreire Helene Using remote sensing to define environmental characteristics related to physical activity and dietary behaviours: a systematic review (the SPOTLIGHT project) Using remote sensing to define environmental characteristics related to physical activity and dietary behaviours: a systematic review (the SPOTLIGHT project) Health and Place';
    expect(shingleString).to.be.equal(expectedShingleString);
    done();
  });
});

// fonction de vérification et suppression de l'index pour les tests
let checkAndDeleteIndex = function (cbCheck) {
  esClient.indices.exists({ index: esConf.index }, function (errorExists, exists) {
    if (errorExists) {
      console.error(`Problème dans la vérification de l'index ${esConf.index}\n${errorExists.message}`);
      process.exit(1);
    }
    if (!exists) { return cbCheck(); }
    esClient.indices.delete({ index: esConf.index }, function (errorDelete, responseDelete) {
      if (errorDelete) {
        console.error(`Problème dans la suppression de l'index ${esConf.index}\n${errorDelete.message}`);
        process.exit(1);
      }
      return cbCheck();
    });
  });
};

describe('#Tests co-similarity...', function () {
  this.timeout(20000);
  debug(esConf);

  // Méthde d'initialisation s'exécutant en tout premier
  before(function (done) {
    checkAndDeleteIndex(function (errCheck) {
      console.log(`Nettoyage de l'index ${esConf.index}...`);
      if (errCheck) {
        console.error('Erreur checkAndDelete() : ' + errCheck.errMessage);
        process.exit(1);
      }

      console.log(`Remplissage de l'index ${esConf.index} avec données de test...`);
      const dumpResult = spawnSync('./load-es.sh', [esConf.host, esConf.index], {
        cwd: __dirname,
        encoding: 'utf8'
      });
      if (dumpResult.status !== 0 || dumpResult.stderr !== '') {
        console.error('stderr : ' + dumpResult.stderr + ', status=' + dumpResult.status);
        console.error(dumpResult);
        process.exit(1);
      } else {
        console.log(`Remplissage de l'index ${esConf.index} OK.`);
        done();
      }
    });
  });

  // test sur la création de règle
  describe("#doTheJob sur l'ensemble du jeu de test", function () {
    it('devrait traiter correctement les ' + testData.length + ' docObjects ', function () {
      return Promise.map(testData, docObject => {
        return new Promise((resolve, reject) => {
          business.doTheJob(docObject, function (error) {
            if (error) return reject(error);
            expect('isNearDuplicate' in docObject, 'la clé isNearDuplicate devrait avoir été positionnée').to.be.true;
            expect('nearDuplicates' in docObject, 'la clé nearDuplicates devrait avoir été positionnée').to.be.true;
            expect(Array.isArray(docObject.nearDuplicates), 'la clé nearDuplicates devrait être un tableau').to.be.true;
            debug('fin doTheJob sur ' + docObject.idConditor);
            resolve();
          });
        });
      }).then(() => {
        return new Promise((resolve, reject) => {
          business.finalJob(testData, function (error) {
            if (error) return reject(error);
            resolve();
          });
        });
      }).delay(2000);
    });

    it('devrait avoir repéré les doublons incertains attendus', function () {
      return esClient.search({
        index: esConf.index,
        q: 'isNearDuplicate:true'
      }).then(response => {
        debug(response.hits.total);
        debug(`${response.hits.total} doublons ont été repérés.`);
        expect(response.hits.total, 'devrait repérer 9 doublons incertains').to.be.equal(9);
        response.hits.hits.map(hit => {
          expect(hit._source.nearDuplicates, 'le document posséder au moins un doublon').to.be.an('array');
          expect(hit._source.nearDuplicates.length, 'le document posséder au moins un doublon').to.be.gte(1);
          hit._source.nearDuplicates.map(nearDuplicates => {
            expect(nearDuplicates.idConditor.length, 'le doublon doit posséder un idConditor').to.be.equal(25);
            expect(nearDuplicates.source.length, 'le doublon doit posséder une source').to.be.gte(1);
            expect(nearDuplicates.type.length, 'le doublon doit posséder un type').to.be.gte(1);
            expect(nearDuplicates.duplicateBySymmetry || hit.score !== 0, "le doublon doit posséder soit un score, soit l'attribut duplicateBySymmetry").to.be.true;
          });
        });
      });
    });

    it('devrait avoir propagé les doublons incertains (lien bidirectionnel)', function () {
      return esClient.search({
        index: esConf.index,
        q: 'idConditor:OBt1BTy7ko4E62xLqqEZTiou1'
      }).then(response => {
        response.hits.hits.map(hit => {
          expect(hit._source.isNearDuplicate, "le doc d'idConditor OBt1BTy7ko4E62xLqqEZTiou1 devrait avoir isNearDuplicate=true").to.be.true;
          hit._source.nearDuplicates.map(nearDuplicates => {
            expect(nearDuplicates.idConditor, 'le doublon incertain de OBt1BTy7ko4E62xLqqEZTiou1 devrait être Cq0XJKEqo4VbqUwANZisaIhHR').to.be.equal('Cq0XJKEqo4VbqUwANZisaIhHR');
            expect(nearDuplicates.source, 'la source de Cq0XJKEqo4VbqUwANZisaIhHR devrait être hal').to.be.equal('hal');
            expect(nearDuplicates.duplicateBySymmetry, 'le doc Cq0XJKEqo4VbqUwANZisaIhHR est doublon par symétrie uniquement').to.be.equal(true);
          })
        })
      });
    });

    it('devrait avoir taggé les documents "non doublons incertains"', function () {
      return esClient.search({
        index: esConf.index,
        q: 'isNearDuplicate:false'
      }).then(response => {
        debug(response.hits.total);
        expect(response.hits.total, 'Devrait trouver des documents sur la requete isNearDuplicate:false').to.be.equal(9);
        response.hits.hits.map(hit => {
          expect(hit._source.isNearDuplicate, 'la réponse devrait contenir le champ isNearDuplicate avec la valeur false').to.be.equal(false);
          expect(hit._source.nearDuplicates, 'la réponse devrait contenir le champ nearDuplicates de type Array').to.be.an('Array');
          expect(hit._source.nearDuplicates.length, 'la réponse devrait contenir le champ nearDuplicates comme un tableau vide').to.be.equal(0);
          expect(hit._source.isNearDuplicate, 'la réponse devrait contenir le champ isNearDuplicate avec la valeur false').to.be.equal(false);
          expect(hit._source.nearDuplicates, 'la réponse devrait contenir le champ nearDuplicates de type Array').to.be.an('Array');
          expect(hit._source.nearDuplicates.length, 'la réponse devrait contenir le champ nearDuplicates comme un tableau vide').to.be.equal(0);
        })
      });
    });
  });

//   it('devrait avoir propagé les doublons incertains (lien bidirectionnel) - symmetry', function () {
//     return esClient.search({
//       index: esConf.index,
//       q: 'idConditor:my1z9a22ccF6JDuAiboDpeJ2A OR idConditor:SA9nsgVxlO2qsCvkmFRGhtZal OR idConditor:L5xHWAJRfLKjLfkeABcDZWhsX'
//     }).then(response => {
//       response.hits.hits.map(hit => {
//         expect(hit._source.isNearDuplicate, "le doc d'idConditor OBt1BTy7ko4E62xLqqEZTiou1 devrait avoir isNearDuplicate=true").to.be.true;
//         hit._source.nearDuplicates.map(nearDuplicates => {
//           expect(nearDuplicates.idConditor, 'le doublon incertain de OBt1BTy7ko4E62xLqqEZTiou1 devrait être Cq0XJKEqo4VbqUwANZisaIhHR').to.be.equal('Cq0XJKEqo4VbqUwANZisaIhHR');
//           expect(nearDuplicates.source, 'la source de Cq0XJKEqo4VbqUwANZisaIhHR devrait être hal').to.be.equal('hal');
//           expect(nearDuplicates.duplicateBySymmetry, 'le doc Cq0XJKEqo4VbqUwANZisaIhHR est doublon par symétrie uniquement').to.be.equal(true);
//         })
//       })
//     });
//   });
});
