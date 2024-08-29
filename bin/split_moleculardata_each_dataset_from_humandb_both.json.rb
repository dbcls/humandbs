require 'json'

def process_molecular_data_element(data_key, data_value, nbdc_research_id)
  output = {
    "id" => data_key,
    "NBDC Research ID" => nbdc_research_id,
    "Participants/Materials" => data_value["Participants/Materials"],
    "Targets" => data_value["Targets"],
    "Target Loci for Capture Methods" => data_value["Target Loci for Capture Methods"],
    "Platform" => data_value["Platform"],
    "Source" => data_value["Source"],
    "Cell Lines" => data_value["Cell Lines"],
    "Reagents (Kit, Version)" => data_value["Reagents (Kit, Version)"],
    "Genotype Call Methods (software)" => data_value["Genotype Call Methods (software)"],
    "Filtering Methods" => data_value["Filtering Methods"],
    "Marker Number (after QC)" => data_value["Marker Number (after QC)"],
    "NBDC Dataset ID" => data_value["NBDC Dataset ID"],
    "Total Data Volume" => data_value["Total Data Volume"],
    "Comments (Policies)" => data_value["Comments (Policies)"],
    "lang" => "en"  # Indicating the language as "en"
  }
  # Print each record in JSONL format
  puts JSON.generate(output)
end

def find_and_extract_en_molecular_data(json_obj)
  if json_obj.is_a?(Hash)
    # Check if the current level contains the "en" section
    if json_obj.key?("en")
      en_section = json_obj["en"]

      # Capture the "NBDC Research ID" at this level
      nbdc_research_id = en_section["NBDC Research ID"]

      # Process "MOLECULAR DATA" under the "en" section
      if en_section.key?("MOLECULAR DATA")
        molecular_data_elements = en_section["MOLECULAR DATA"]

        molecular_data_elements.each do |data_key, data_value|
          process_molecular_data_element(data_key, data_value, nbdc_research_id)
        end
      end
    end

    # Recursively search in the nested hashes
    json_obj.each do |key, value|
      find_and_extract_en_molecular_data(value)
    end
  elsif json_obj.is_a?(Array)
    # Recursively search in the array elements
    json_obj.each do |element|
      find_and_extract_en_molecular_data(element)
    end
  end
end

# Main program
if ARGV.length != 1
  puts "Usage: ruby extract_en_molecular_data_with_split_dataset_ids.rb <path_to_json_file>"
  exit 1
end

file_path = ARGV[0]
file_content = File.read(file_path)
data = JSON.parse(file_content)

# Start the recursive search
find_and_extract_en_molecular_data(data)
