# HumanDBs Backend

## Crawler

`./crawler-results` に、各 crawler の結果が出力される。

現状、mode として、`"elasticsearch" | "detail" | "summary"` がある。

- `elasticsearch`: elasticsearch に insert するための json
- `detail`: 各 html (humIdVersion 単位) ごとの parse 結果の json
- `summary`: 各 field ごとなどの summary files

まず、html file が fetch されて、detail json が生成され、それを元に elasticsearch json や summary json が生成される。  
html が既に存在する場合、cache として、それが使われる。
もし、cache を無視する場合は、`--no-cache` オプションをつける。

```bash
bun run crawler --process detail
bun run crawler --process summary
bun run crawler --process elasticsearch
```
