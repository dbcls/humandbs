import { useState } from "react"

import { cn } from "@/lib/utils"

const languages = [
  { code: "en", name: "En" },
  { code: "ja", name: "Ja" },
] as const

export function LangSwitcher() {

  const [selectedLang, setSelectedLang] = useState<string>(() => languages[0].code)

  return (
    <div className=" bg-primary/50 f relative flex rounded-full p-1">
      {
        languages.map((lang) => (
          <button onClick={() => {
            setSelectedLang(lang.code)
          }} key={lang.code} className={cn(" z-10 uppercase font-bold cursor-pointer rounded-full h-8 w-8 text-center text-foreground-light text-sm", {
            " text-white": selectedLang === lang.code,
          })}>{lang.name}</button>
        ))
      }

      <div className=" bg-secondary absolute z-0 size-8 rounded-full transition-transform" style={{
        transform: `translateX(${selectedLang === "en" ? 0 : 32}px)`,
      }} />
    </div>
  )
}
