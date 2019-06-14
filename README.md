[![Build Status](https://travis-ci.org/conditor-project/co-similarity.svg?branch=master)](https://travis-ci.org/conditor-project/co-similarity)

# co-similarity
Module ayant pour objectif de repérer pour chaque docObject des objets similaires.

## Principes
Ce module met en oeuvre une technique de dédoublonnage à base de shingles et de comparaison d'empreintes (fingerprints). Cette méthode s'inspire de l'expérience d'Altavista en 1999 [décrite dans cet article](https://www.researchgate.net/publication/221313743_Identifying_and_Filtering_Near-Duplicate_Documents).

L'algoritms de similarité pour le repérage de doublons incertains est expliqué [ici](https://wiki.conditor.fr/conditor/index.php/Algorithme_de_similarit%C3%A9_pour_le_rep%C3%A9rage_de_doublons_incertains)

_Note_ : Contrairement au module [co-deduplicate](https://github.com/conditor-project/co-deduplicate), qui détecte des doublons "certains" (fiables à 100%), les doublons repérés par `co-similarity` sont considérés comme "incertains" ("near duplicates" en anglais) et doivent être validés par un être humain.

## Prérequis

Préalablement à l'exécution du module `co-similarity`, les docObjects doivent donc avoir été traités par le module [co-deduplicate](https://github.com/conditor-project/co-deduplicate) (étapes 1 et 2 précédentes)

Le module co-similarity ne met donc réellement en oeuvre que les étapes 3 et 4.
