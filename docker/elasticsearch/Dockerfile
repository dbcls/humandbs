# Elasticsearch image with the Japanese morphological analyzer plugin.
# The default index analyzer is kuromoji-based (apps/backend/src/es/analysis.ts),
# which requires analysis-kuromoji at the cluster level.
FROM docker.elastic.co/elasticsearch/elasticsearch:8.17.6

RUN bin/elasticsearch-plugin install --batch analysis-kuromoji
