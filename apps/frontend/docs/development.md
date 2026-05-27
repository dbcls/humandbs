# Development docs

## Use of the backend zod shemas in frontend

1. Since frontend imports the zod schemas from the backend, every time the backend schema that is being imported to the frontend gets changed, there is a need to rebuild the frontend, in order to use that updated schema.

2. In order to maintain correct `bun.lock`, always install new packages / remove unneeded ones inside the docker container.
