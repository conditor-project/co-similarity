'use strict'

const _ = require('lodash'),
  metadataMappings = require('co-config/metadata-mappings.json');


class CoUnique{


constructor() {

  this.listId =[];
  this.CONDITOR_SESSION = process.env.ISTEX_SESSION || "TEST_1970-01-01-00-00-00";
  this.MODULEROOT = process.env.MODULEROOT || __dirname;

}



  doTheJob(jsonLine, cb) {

    let source = jsonLine.source;
    let idSource;
    let nameId;

    _.each(metadataMappings,(mappingSource)=>{
      if (mappingSource.source === source) { nameId = mappingSource.nameID; }
    });

    if ( nameId === undefined || nameId.trim ==="") {

      let error = {
        errCode: 1,
        errMessage: "Aucun mapping valide trouvé pour cette source."
      };
      jsonLine.error = error;
      cb(error);

    }
    else {
      idSource = jsonLine[nameId];
      if (_.indexOf(this.listId,idSource.value) !== -1){

        let error = {
          errCode: 2,
          errMessage: "ID source déjà présent dans le corpus"
        };
        jsonLine.error = error;
        cb(error);

      }
      else {
        this.listId.push(idSource.value);
        cb();
      }
    }
  }
}
module.exports = new CoUnique();