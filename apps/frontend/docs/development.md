# Development docs

## Use of the backend types and zod shemas

- Since frontend imports the zod schemas from the backend, every time the backend schema that is being imported to the frontend gets changed, there is a need to rebuild the frontend, in order to use that updated schema.
