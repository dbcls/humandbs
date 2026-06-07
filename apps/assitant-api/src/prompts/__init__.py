from pathlib import Path

_PROMPTS_DIR = Path(__file__).parent


def load_prompt(filename: str, **kwargs) -> str:
    """プロンプトテンプレートファイルを読み込み、パラメータを埋め込んで返す。

    Args:
        filename: src/prompts/ ディレクトリ内のテンプレートファイル名。
        **kwargs: テンプレート内の {変数名} プレースホルダーに埋め込む値。

    Returns:
        str: パラメータが埋め込まれたプロンプト文字列。
    """
    template = (_PROMPTS_DIR / filename).read_text(encoding="utf-8")
    return template.format(**kwargs)
