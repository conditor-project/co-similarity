'use strict';

const
  pkg = require('../package.json'),
  business = require('../index.js'),
  testData = require('./dataset/in/test.json'),
  chai = require('chai'),
  expect = chai.expect,
  _ = require('lodash');
 

  describe('#insert notice 1', function () {

    let docObject;

    it('L id est bien stocké', function (done) {
      docObject = testData[0];
      business.doTheJob(docObject = testData[0], function (err) {
        expect(err).to.be.undefined;
        done();
      });
    });

    it('L id est rejeté', function (done) {
      docObject = testData[1];
      business.doTheJob(docObject, function (err) {
        expect(err).to.be.not.undefined;
        done();
      });
    });

    it('La source n est pas trouvée', function (done) {
      docObject = testData[1];
      business.doTheJob(docObject, function (err) {
        expect(err).to.be.not.undefined;
        done();
      });
    });

    

  });
