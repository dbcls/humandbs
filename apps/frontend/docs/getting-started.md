# Getting started

Describes what to do to run "from zero".
Supposes that the docker/podman containers are alerady running.

> All commannds should be run inside the `frontend` container

1. **Migration** :

- `bun db:push` - in case of the first time run, when the CMS db is clear.
- `bun db:migrate` - in case when db has some data.

2. **Build** - `bun run build`
3. **Start** - `bun run start`

4. **Seeding** :
   - Preferred, simple way - use the Data Transfer feature to download CMS content as a tar.gz archive. Go to the [staging env site's Data Transfer page](https://humandbs-staging.ddbj.nig.ac.jp/admin/data-transfer) and download the archive (`CMSデータをダウンロード`, choose all items to download). Then go to your locally run frontend, `http://localhost:8080/admin/data-transfer`, and upload that tar.gz file in the `アーカイブからデータを復元` section.

   - In other case - `bun db:seed-all` from inside the frontend container. More about seeding scripts - see the [Migration scripts REAMDE](../src/scripts/database/README.md)
