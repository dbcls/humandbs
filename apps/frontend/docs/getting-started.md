# Getting started

Describes what to do to run "from zero".
Supposes that the docker/podman containers are alerady running.

> All commannds should be run inside the `frontend` container

1. **Migration** :

- `bun db:push` - in case of the first time run, when the CMS db is clear.
- `bun db:migrate` - in case when db has some data.

2. **Seeding** - `bun db:seed-all` - if needed. More about seeding scripts - see the [Migration scripts REAMDE](../src/scripts/database/README.md)
3. **Build** - `bun run build`
4. **Start** - `bun run start`
