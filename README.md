[![Build Status](https://travis-ci.org/conditor-project/co-similarity.svg?branch=master)](https://travis-ci.org/conditor-project/co-similarity)

# co-similarity
Module ayant pour objectif de repérer pour chaque docObject des objets similaires.

## Principes
Ce module met en oeuvre une technique de dédoublonnage à base de shingles et de comparaison d'empreintes (fingerprints). Cette méthode s'inspire de l'expérience d'Altavista en 1999 [décrite dans cet article](https://www.researchgate.net/publication/221313743_Identifying_and_Filtering_Near-Duplicate_Documents).

Concrètement, l'algorithme utilisé est le suivant :

1. lors de l'indexation d'un document dans Elasticsearch, les principaux champs textuels (titres, auteurs, résumés...) sont découpés en shingles (N-grams) de taille limitée : 2 à 4 actuellement. 
2. l'ensemble de ces shingles est aggrégé dans un champ `fingerprint`, qui constitue une empreinte représentant ce document.
3. pour rechercher les doublons incertains d'un docObject, `co-similarity` effectue une requête de de type "pattern matching" sur le champ `fingerprint` et analyse les résultats ainsi :
   1. on détermine un score maximal, défini par le plus haut résultat, qui sera toujours le docObject lui-même
   2. on considère comme doublons incertains tous les résultats dont le score dépasse un certain seuil (80% du score max.)
4. le docObject est ensuite mis à jour dans Elasticsearch, avec l'ajout des champs `isNearDuplicate` et `nearDuplicate`.

_Note_ : Contrairement au module [co-deduplicate](https://github.com/conditor-project/co-deduplicate), qui détecte des doublons "certains" (fiables à 100%), les doublons repérés par `co-similarity` sont considérés comme "incertains" ("near duplicates" en anglais) et doivent être validés par un être humain.

## Prérequis

Préalablement à l'exécution du module `co-similarity`, les docObjects doivent donc avoir été traités par le module [co-deduplicate](https://github.com/conditor-project/co-deduplicate) (étapes 1 et 2 précédentes)

Le module co-similarity ne met donc réellement en oeuvre que les étapes 3 et 4.
