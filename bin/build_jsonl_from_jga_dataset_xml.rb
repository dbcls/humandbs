require 'nokogiri'
require 'json'
require 'csv'

def parse_csv_to_hash(file_path)
  result_hash = {}

  CSV.foreach(file_path, headers: true) do |row|
    result_hash[row["accession"]] = row.to_h
  end

  result_hash
end

date_h = parse_csv_to_hash('metadata/dataset.date.csv')

def parse_jsonl_to_hash(file_path)
  result_hash = {}

  File.foreach(file_path) do |line|
    json_object = JSON.parse(line)
    result_hash[json_object["id"]] = json_object
  end

  result_hash
end

sample_h = parse_jsonl_to_hash('sample-attributes-per-dataset-20240820.jsonl')

if ARGV.length != 1
  puts "Usage: ruby t.rb <path_to_xml_file>"
  exit
end

xml_file = ARGV[0]

begin
  xml_data = File.read(xml_file)
rescue Errno::ENOENT
  puts "File not found: #{xml_file}"
  exit
end

doc = Nokogiri::XML(xml_data)

def xml_node_to_hash(node)
  result = {}

  node.attributes.each do |name, attr|
    result[name] = attr.value
  end

  node.element_children.each do |child|
    child_hash = xml_node_to_hash(child)
    if result[child.name]
      result[child.name] = [result[child.name]] unless result[child.name].is_a?(Array)
      result[child.name] << child_hash
    else
      result[child.name] = child_hash
    end
  end

  if node.text.strip != "" && node.attributes.empty? && node.element_children.empty?
    return node.text.strip
  end

  if result.empty? && (node.name == "DATA_REFS" || node.name == "ANALYSIS_REFS")
    return []
  end

  result
end

datasets = doc.xpath('//DATASET').map do |dataset|
  dataset_hash = xml_node_to_hash(dataset)

  if dataset_hash['DATA_REFS']
    if dataset_hash['DATA_REFS'].is_a?(Hash) && dataset_hash['DATA_REFS']['DATA_REF']
      dataset_hash['DATA_REF'] = dataset_hash['DATA_REFS']['DATA_REF']
    else
      dataset_hash['DATA_REF'] = []
    end
    dataset_hash.delete('DATA_REFS')
  end

  if dataset_hash['ANALYSIS_REFS']
    if dataset_hash['ANALYSIS_REFS'].is_a?(Hash) && dataset_hash['ANALYSIS_REFS']['ANALYSIS_REF']
      dataset_hash['ANALYSIS_REF'] = dataset_hash['ANALYSIS_REFS']['ANALYSIS_REF']
    else
      dataset_hash['ANALYSIS_REF'] = []
    end
    dataset_hash.delete('ANALYSIS_REFS')
  end

  id = dataset_hash['accession']
  dataset_hash['dateCreated'] = date_h[id]['datecreated']
  dataset_hash['datePublished'] = date_h[id]['datepublished']
  dataset_hash['dateModified'] = date_h[id]['datemodified']
  dataset_hash['samples'] = sample_h[id]

  dataset_hash
end

datasets.each do |dataset|
  puts dataset.to_json
end
