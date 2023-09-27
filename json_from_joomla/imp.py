import pymongo
import json
from pymongo import MongoClient, InsertOne

connect_string = "mongodb+srv://mitsuhashi:humandbs@humandbs.ls7wa4b.mongodb.net/?retryWrites=true&w=majority&appName=AtlasApp"
json_to_import = "humandbs_en_20230926.json"

client = MongoClient(connect_string)

# database
db = client["humandbs"]

# Created or Switched to collection
# names: GeeksForGeeks
collection = db["metadata"]

with open(json_to_import) as file:
    file_data = json.load(file)

# Inserting the loaded data in the Collection
# if JSON contains data more than one entry
# insert_many is used else insert_one is used
if isinstance(file_data, list):
    collection.insert_many(file_data) 
else:
    collection.insert_one(file_data)

client.close()
