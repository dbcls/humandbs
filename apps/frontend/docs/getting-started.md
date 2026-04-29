# Getting started

Describes what to do to run "from zero".
Supposes that the docker/podman containers are alerady running.

> All commannds should be run inside the `frontend` container

1. **Migration** - `bun db:push`
2. **Seeding** - `bun db:seed-all`

More about seeding scripts - see the [Migration scripts REAMDE](../src/scripts/database/README.md)
