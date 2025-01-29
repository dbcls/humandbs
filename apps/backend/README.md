# Shin HumanDBs Backend

- at `at073`
  - `/lustre9/open/database/ddbjshare/private/ddbj.nig.ac.jp/jga/metadata` を mount している
    - frontend のため、普段は comment out しておく

```bash
docker network create humandbs-dev-network
docker-compose -f compose.dev.yml up -d --build backend
```
