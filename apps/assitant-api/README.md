# Human Database Submission Assistant

FastAPI implementation of the Human Database Submission Assistant workflow, which automates the evaluation of human database access applications.

## Features

- PDF document extraction to parse application forms
- Web scraping integration with HumanDBS to retrieve dataset information
- CrossRef API integration for analyzing research publications
- AI-powered evaluation of application compatibility
- Asynchronous processing with background tasks

## Update

- To update the application with the latest changes, use the following command:

  ```
  git pull origin <branch-name>
  ```

- Remove cached LLM responses to ensure that the application uses the latest logic:

  ```
  rm langchain_cache.db
  rm -r google_genai_cache
  ```

- Rebuild and restart the application:
  ```
  docker compose up --build -d
  ```

## API Endpoints

See http://localhost:3001/docs for details on available endpoints.

## Debugging

- To run the application in debug mode, use the following command:

  ```
  bash start_debugger.sh
  ```

- This will start the application with debugpy. To start debugging, open VS Code and attach to the debugger using `Docker (FastAPI)` configuration.
