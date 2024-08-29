require 'json'

# Function to recursively find and convert "USERS (Controlled-Access Data)"
def find_and_convert_users(json_data, nbdc_research_id = nil)
  json_data.each do |key, value|
    if key == "USERS (Controlled-Access Data)"
      convert_to_jsonl(value, nbdc_research_id)
    elsif key == "NBDC Research ID"
      nbdc_research_id = value
    elsif value.is_a?(Hash)
      find_and_convert_users(value, nbdc_research_id)
    end
  end
end

# Function to expand JGAD ranges and convert relevant elements to JSONL
def convert_to_jsonl(user_data, nbdc_research_id)
  user_data.each do |user, details|
    details.each do |key, value|
      if value.is_a?(String) && value.include?("JGAD")
        ids = value.split(", ").flat_map do |part|
          if part.include?("-")
            start_id, end_id = part.split("-").map { |id| id.gsub("JGAD", "").to_i }
            (start_id..end_id).map { |i| "JGAD#{i.to_s.rjust(6, '0')}" }
          else
            part
          end
        end

        ids.each do |id|
          jsonl = {
            "id" => id,
            "NBDC Research ID" => nbdc_research_id,
            "Principal Investigator" => details["Principal Investigator"],
            "Affiliation" => details["Affiliation"],
            "Country/Region" => details["Country/Region"],
            "Research Title" => details["Research Title"],
            "Data in Use (Dataset ID)" => details["Data in Use (Dataset ID)"],
            "Period of Data Use" => details["Period of Data Use"]
          }

          puts JSON.generate(jsonl)
        end
      end
    end
  end
end

# Main script
file_path = ARGV.shift
if file_path.nil? || !File.exist?(file_path)
  puts "Please provide a valid JSON file path."
  exit
end

# Read and parse the JSON file
json_data = JSON.parse(File.read(file_path))

# Start searching and converting
find_and_convert_users(json_data)
