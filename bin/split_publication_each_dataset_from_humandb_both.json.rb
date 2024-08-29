require 'json'

def find_and_extract_publications(json_obj, nbdc_research_id = nil)
  if json_obj.is_a?(Hash)
    # Check if the current level contains "NBDC Research ID"
    nbdc_research_id ||= json_obj["NBDC Research ID"]

    # If "PUBLICATIONS" key is found, process it
    if json_obj.key?("PUBLICATIONS")
      publications = json_obj["PUBLICATIONS"]

      publications.each_value do |pub|
        # Handle cases where "Data Set ID" is a single string containing multiple IDs
        dataset_ids = pub["Data Set ID"]
        
        # Split the "Data Set ID" based on delimiters (comma, newline, etc.)
        ids = dataset_ids.split(/[\r\n,]+/)

        ids.each do |id|
          output = {
            "id" => id.strip,  # Adding the split id as a new key
            "NBDC Research ID" => nbdc_research_id,
            "Title" => pub["Title"],
            "DOI" => pub["DOI"],
            "Data Set ID" => dataset_ids  # Retaining the original "Data Set ID" string
          }
          # Print each record in JSONL format
          puts JSON.generate(output)
        end
      end
    end

    # Recursively search in the nested hashes
    json_obj.each do |key, value|
      find_and_extract_publications(value, nbdc_research_id)
    end
  elsif json_obj.is_a?(Array)
    # Recursively search in the array elements
    json_obj.each do |element|
      find_and_extract_publications(element, nbdc_research_id)
    end
  end
end

# Main program
if ARGV.length != 1
  puts "Usage: ruby extract_publications_with_split_dataset_ids.rb <path_to_json_file>"
  exit 1
end

file_path = ARGV[0]
file_content = File.read(file_path)
data = JSON.parse(file_content)

# Start the recursive search
find_and_extract_publications(data)
