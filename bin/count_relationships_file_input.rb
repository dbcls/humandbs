require 'json'

def count_and_merge_relationships(edges)
  relationship_count = Hash.new(0)
  id_list = Hash.new { |hash, key| hash[key] = [] }

  edges.each do |id1, id2|
    # 両方のIDの組み合わせを考慮して頻度をカウント
    relationship_count[id1] += 1
    relationship_count[id2] += 1

    # IDごとのペアリストを保持
    id_list[id1] << id2 unless id_list[id1].include?(id2)
    id_list[id2] << id1 unless id_list[id2].include?(id1)
  end

  [relationship_count, id_list]
end

# ファイル名を取得
input_file_name = ARGV.shift

# ファイルからエッジを読み込む
edges = []
File.foreach(input_file_name) do |line|
  id1, id2 = line.split
  edges << [id1, id2]
end

# 同一IDの出現頻度とリストをカウント
relationship_count, id_list = count_and_merge_relationships(edges)

# 標準出力に頻度が2以上のものをJSONL形式で出力
relationship_count.each do |id, count|
  if count >= 2
    puts({ id: id, frequency: count, related_ids: id_list[id] }.to_json)
  end
end
