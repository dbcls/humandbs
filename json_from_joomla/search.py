import pymongo
import json
from pymongo import MongoClient, InsertOne

connect_string = "mongodb+srv://mitsuhashi:humandbs@humandbs.ls7wa4b.mongodb.net/?retryWrites=true&w=majority&appName=AtlasApp"
json_to_import = "humandbs_en_20230926.json"

myclient = MongoClient(connect_string)

# database
db = myclient["humandbs"]

# Created or Switched to collection
# names: GeeksForGeeks
collection = db["metadata"]

# インデックスの作成（Full-Text Searchを有効にするために必要）
collection.create_index([("NBDC Research ID", "text")])

for data in collection.find({ 'NBDC Research ID' : 'hum0386.v1' }):
    print(data)