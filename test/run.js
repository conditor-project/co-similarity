'use strict';

const
  pkg = require('../package.json'),
  rewire = require('rewire'),
  business = rewire('../index.js'),
  testData = require('./dataset/in/test.json'),
  chai = require('chai'),
  expect = chai.expect,
  _ = require('lodash'),
  es = require('elasticsearch'),
  spawnSync = require('child_process').spawnSync,
  eachSeries = require('async/eachSeries'),
  debug = require('debug')('test');

  var esConf = require('co-config/es.js');
  esConf.index = 'test-records';
  business.__set__('esConf.index','test-records');
  
  const esClient = new es.Client({
    host: esConf.host,
    log: {
      type: 'file',
      level: ['error']
    }
  });

//fonction de vérification et suppression de l'index pour les tests
let checkAndDeleteIndex = function (cbCheck) {
  esClient.indices.exists({index: esConf.index}, function (errorExists, exists) {
    if (errorExists) {
      console.error(`Problème dans la vérification de l'index ${esConf.index}\n${errorExists.message}`);
      process.exit(1);
    }
    if (!exists) { return cbCheck(); }
    esClient.indices.delete({index: esConf.index}, function (errorDelete, responseDelete) {
      if (errorDelete) {
        console.error(`Problème dans la suppression de l'index ${esConf.index}\n${errorDelete.message}`);
        process.exit(1);
      }
      return cbCheck();
    });
  });
};


  describe('#Tests co-similarity...', function () {

    this.timeout(10000);
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
        const dumpResult = spawnSync("./load-es.sh",[esConf.host,esConf.index], {
          cwd: __dirname,
          encoding: 'utf8',
        });
        if (dumpResult.status !== 0 || dumpResult.stderr !== "" ) {
          console.error("stderr : "+dumpResult.stderr+", status="+dumpResult.status);
          console.error(dumpResult);
          process.exit(1);
        } else {
          console.log(`Remplissage de l'index ${esConf.index} OK.`);
          setTimeout(() => {
            done();
          }, 2000);
        }
  
      });
  
    });

    //test sur la création de règle 
    describe("#doTheJob sur l'ensemble du jeu de test", function () {

      it('devrait traiter correctement les ' + testData.length + ' docObjects ', function (done) {
        eachSeries(testData, function (docObject, cbEach) {
          console.log("doTheJob sur docObject d'idConditor " + docObject.idConditor);

          business.doTheJob(docObject, function (err) {
            setTimeout(function () {
              if (err) console.error("erreur traitement du docObect " + docObject.idConditor, err);
              expect(err).to.be.undefined;
              expect('isNearDuplicate' in docObject, 'la clé isNearDuplicate devrait avoir été positionnée').to.be.true;
              expect('nearDuplicate' in docObject, 'la clé nearDuplicate devrait avoir été positionnée').to.be.true;
              expect(Array.isArray(docObject.nearDuplicate), 'la clé nearDuplicate devrait être un tableau').to.be.true;
              debug("fin doTheJob sur " + docObject.idConditor);
              cbEach();
            }, 300);
          });
        }, function (errEach) {
          debug("dans cb finale")
          expect(errEach).to.be.null;
          done();
        });
      });

      it('devrait avoir repéré les doublons incertains attendus', function(done) {
        esClient.search({
          index: esConf.index,
          q: "isNearDuplicate:true"
        }, function (esError, response) {
          debug(response.hits.total);
          expect(esError).to.be.undefined;
          expect(response.hits.total,"devrait repéré 8 doublons incertains").to.be.equal(8);
          done();
        });
      });

    });

  });
