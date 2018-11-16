#!/bin/bash

# echo "elasticdump --input=\"dataset/in/settings.json\" --output=\"$1/$2\" --type=\"settings\""
npx elasticdump --input="dataset/in/settings.json" --output="http://$1/$2" --type="settings"
npx elasticdump --input="dataset/in/analyzer.json" --output="http://$1/$2" --type="analyzer"
npx elasticdump --input="dataset/in/mapping.json" --output="http://$1/$2" --type="mapping"
npx elasticdump --input="dataset/in/data.json" --output="http://$1/$2" --type="data"
