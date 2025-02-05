function NewsItem({ newsItem }: {
  newsItem: NewsItem
}) {
  return (
    <li> <span className=" text-xs"> {newsItem.date}</span> <a className=" text-secondary text-sm underline" href={newsItem.href}>{newsItem.title}</a></li>
  )
}

export interface NewsItem {
  date: string,
  title: string,
  href: string,
}

function News({ news }: {
  news: NewsItem[]
}) {
  return (
    <div className=" flex flex-col gap-2">
      <ul className=" space-y-2 ">
        {news.map((item, index) => (
          <NewsItem key={index} newsItem={item} />
        ))}
      </ul>
      <a className="text-secondary block text-xs underline">ニュース一覧</a>
    </div>
  )
}

export { News }
