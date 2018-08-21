#!/bin/bash

ls test/dataset/in
if [ ! -f test/dataset/in/data.json ] || [ ! -f test/dataset/in/test.json ]; then
    read -s -p "saisissez le mot de passe nécessaire à l'extraction des données de test : " ZIP_PASSWORD
    unzip -o -P ${ZIP_PASSWORD} ./test/dataset/in/testdata.zip -d ./test/dataset/in
fi
