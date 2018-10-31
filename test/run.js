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
  eachLimit = require('async/eachLimit'),
  debug = require('debug')('test');

var esConf = require('co-config/es.js');
esConf.index = 'test-records';
business.__set__('esConf.index', 'test-records');

const esClient = new es.Client({
  host: esConf.host,
  log: {
    type: 'file',
    level: ['error']
  }
});


//test sur certaines méthodes de co-similarity
describe("#test sur certaines méthodes de co-similarity", function () {
  it('devrait recalculer le bon fingerprint', function (done) {
    let docObect = testData[0];
    const shingleString = business.getShingleString(docObect);
    const expectedShingleString = 'Charreire Helene Using remote sensing to define environmental characteristics related to physical activity and dietary behaviours: a systematic review (the SPOTLIGHT project) Using remote sensing to define environmental characteristics related to physical activity and dietary behaviours: a systematic review (the SPOTLIGHT project) Health and Place';
    expect(shingleString).to.be.equal(expectedShingleString);
    done();
  });
});

//fonction de vérification et suppression de l'index pour les tests
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
      const dumpResult = spawnSync("./load-es.sh", [esConf.host, esConf.index], {
        cwd: __dirname,
        encoding: 'utf8',
      });
      if (dumpResult.status !== 0 || dumpResult.stderr !== "") {
        console.error("stderr : " + dumpResult.stderr + ", status=" + dumpResult.status);
        console.error(dumpResult);
        process.exit(1);
      } else {
        console.log(`Remplissage de l'index ${esConf.index} OK.`);
        setTimeout(() => {
          done();
        }, 1000);
      }

    });

  });

  //test sur la création de règle 
  describe("#doTheJob sur l'ensemble du jeu de test", function () {

    it('devrait traiter correctement les ' + testData.length + ' docObjects ', function (done) {
      eachLimit(testData,20, function (docObject, cbEach) {
        debug("doTheJob sur docObject d'idConditor " + docObject.idConditor);
        setTimeout(function () {
          business.doTheJob(docObject, function (err) {
            if (err) debug(err.errMessage);
            expect(err).to.be.undefined;
            expect('isNearDuplicate' in docObject, 'la clé isNearDuplicate devrait avoir été positionnée').to.be.true;
            expect('nearDuplicate' in docObject, 'la clé nearDuplicate devrait avoir été positionnée').to.be.true;
            expect(Array.isArray(docObject.nearDuplicate), 'la clé nearDuplicate devrait être un tableau').to.be.true;
            debug("fin doTheJob sur " + docObject.idConditor);
            cbEach();
          });
        },500);
      }, function (errEach) {
        debug("dans cb finale")
        expect(errEach).to.be.null;
          business.finalJob(testData,function(error){
            if (error) console.log(error.errMessage);
            expect(error).to.be.undefined;
            setTimeout(function () {
              done();
            },1500);
          });
      });
    });

    it('devrait avoir repéré les doublons incertains attendus', function (done) {
      esClient.search({
        index: esConf.index,
        q: "isNearDuplicate:true"
      }, function (esError, response) {
        debug(response.hits.total);
        expect(esError).to.be.undefined;
        debug(`${response.hits.total} doublons on été repérés.`);
        expect(response.hits.total, "devrait repérer 9 doublons incertains").to.be.equal(9);
        eachLimit(response.hits.hits,10, function (hit, cbEach) {
          expect(hit._source.nearDuplicate,"le documont posséder au moins un doublon").to.be.an('array'); 
          expect(hit._source.nearDuplicate.length,"le documont posséder au moins un doublon").to.be.gte(1); 
          expect(hit._source.nearDuplicate[0].idConditor.length,"le doublon doit posséder un idConditor").to.be.equal(25); 
          expect(hit._source.nearDuplicate[0].source.length,"le doublon doit posséder une source").to.be.gte(1); 
          expect(hit._source.nearDuplicate[0].type.length,"le doublon doit posséder un type").to.be.gte(1); 
          expect(hit._source.nearDuplicate[0].duplicateBySymmetry || hit.score!==0,"le doublon doit posséder soit un score, soit l'attribut duplicateBySymmetry").to.be.true; 
          cbEach()
        },function(errEach) {
          if (errEach) console.error(errEach);
          done();
        });
      });
    });

    it('devrait avoir propagé les doublons incertains (lien bidirectionnel)', function (done) {
      esClient.search({
        index: esConf.index,
        q: "idConditor:OBt1BTy7ko4E62xLqqEZTiou1"
      }, function (esError, response) {
        expect(esError).to.be.undefined;
        expect(response.hits.hits[0]._source.isNearDuplicate, "le doc d'idConditor OBt1BTy7ko4E62xLqqEZTiou1 devrait avoir isNearDuplicate=true").to.be.true;
        expect(response.hits.hits[0]._source.nearDuplicate[0].idConditor,"le doublon incertain de OBt1BTy7ko4E62xLqqEZTiou1 devrait être Cq0XJKEqo4VbqUwANZisaIhHR").to.be.equal("Cq0XJKEqo4VbqUwANZisaIhHR")
        expect(response.hits.hits[0]._source.nearDuplicate[0].source,"la source de Cq0XJKEqo4VbqUwANZisaIhHR devrait être hal").to.be.equal("hal")
        expect(response.hits.hits[0]._source.nearDuplicate[0].duplicateBySymmetry,"le doc Cq0XJKEqo4VbqUwANZisaIhHR est doublon par symétrie uniquement").to.be.equal(true);
        done();
      });
    });

    it('devrait avoir taggé les documents "non doublons incertains"', function (done) {
      esClient.search({
        index: esConf.index,
        q: "isNearDuplicate:false"
      }, function (esError, response) {
        debug(response.hits.total);
        expect(esError).to.be.undefined;
        expect(response.hits.total,"Devrait trouver des documents sur la requete isNearDuplicate:false").to.be.equal(7);
        expect(response.hits.hits[0]._source.isNearDuplicate,"la réponse devrait contenir le champ isNearDuplicate avec la valeur false").to.be.equal(false);
        expect(response.hits.hits[0]._source.nearDuplicate,"la réponse devrait contenir le champ nearDuplicate de type Array").to.be.an("Array");
        expect(response.hits.hits[0]._source.nearDuplicate.length,"la réponse devrait contenir le champ nearDuplicate comme un tableau vide").to.be.equal(0);
        expect(response.hits.hits[6]._source.isNearDuplicate,"la réponse devrait contenir le champ isNearDuplicate avec la valeur false").to.be.equal(false);
        expect(response.hits.hits[6]._source.nearDuplicate,"la réponse devrait contenir le champ nearDuplicate de type Array").to.be.an("Array");
        expect(response.hits.hits[6]._source.nearDuplicate.length,"la réponse devrait contenir le champ nearDuplicate comme un tableau vide").to.be.equal(0);
        done();
      });
    });


  });

});
