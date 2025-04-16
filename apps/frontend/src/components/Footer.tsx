
import DBCLSLogo from "@/assets/DBCLS_Logo.png"

export function Footer() {
  return (
    <footer className=" mt-8 flex h-44 justify-between bg-white p-4 text-sm">

      <nav>

        <h3 className=" text-secondary font-semibold">
          サイトマップ
        </h3>
        <div className=" mt-4 flex gap-8">
          <ul className=" flex flex-col gap-2">
            <li>
              ホーム
            </li>
            <li>
              加工データ
            </li>
            <li>
              ガイドライン違反
            </li>

          </ul>

          <ul className=" flex flex-col gap-2">

            <li>
              ガイドライン
            </li>

            <li>
              機関外サーバ

            </li>

            <li>
              FAQ
            </li>

          </ul>

          <ul className=" flex flex-col gap-2">

            <li>
              データの提供
            </li>

            <li>
              ヒトデータ審査委員会
            </li>

            <li>
              お問い合わせ

            </li>

          </ul>

          <ul className=" flex flex-col gap-2">

            <li>
              データの利用
            </li>

            <li>
              成果発表
            </li>

            <li>
              対応ブラウザ
            </li>

          </ul>

        </div>

      </nav>

      <div>
        <img src={DBCLSLogo} alt=" DBCLS Logo" className="w-32" />

      </div>

    </footer>
  )
}

