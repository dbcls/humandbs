require 'json'

def process_data_element(data_key, data_value, nbdc_research_id)
  # Extract the "Data Set ID", either from the key or from within the record
  dataset_ids = data_value["Data Set ID"] || data_key

  # Split the ID based on delimiters (newline, comma, etc.), handling both single and multiple IDs
  ids = dataset_ids.split(/[\r\n,]+/).map(&:strip)

  ids.each do |id|
    output = {
      "id" => id,
      "NBDC Research ID" => nbdc_research_id,
      "Data Set ID" => dataset_ids,
      "Type of Data" => data_value["Type of Data"],
      "Criteria" => data_value["Criteria"],
      "Release Date" => data_value["Release Date"],
      "lang" => "en"  # Indicating the language as "en"
    }
    # Print each record in JSONL format
    puts JSON.generate(output)
  end
end

def find_and_extract_en_data(json_obj)
  if json_obj.is_a?(Hash)
    # Check if the current level contains the "en" section
    if json_obj.key?("en")
      en_section = json_obj["en"]

      # Capture the "NBDC Research ID" at this level
      nbdc_research_id = en_section["NBDC Research ID"]

      # Process "DATA" under the "en" section
      if en_section.key?("DATA")
        data_elements = en_section["DATA"]

        data_elements.each do |data_key, data_value|
          process_data_element(data_key, data_value, nbdc_research_id)
        end
      end
    end

    # Recursively search in the nested hashes
    json_obj.each do |key, value|
      find_and_extract_en_data(value)
    end
  elsif json_obj.is_a?(Array)
    # Recursively search in the array elements
    json_obj.each do |element|
      find_and_extract_en_data(element)
    end
  end
end

# Main program
if ARGV.length != 1
  puts "Usage: ruby extract_en_data_with_split_dataset_ids.rb <path_to_json_file>"
  exit 1
end

file_path = ARGV[0]
file_content = File.read(file_path)
data = JSON.parse(file_content)

# Start the recursive search
find_and_extract_en_data(data)
