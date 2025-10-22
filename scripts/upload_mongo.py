from pathlib import Path
import os
import json
from typing import List, Dict, Any
from pymongo import MongoClient
from tqdm import tqdm
import logging
from dotenv import load_dotenv
from bson import ObjectId
from datetime import datetime
import hashlib
from collections import defaultdict
import re

# Load JSON-annotated documents from DocumentsStore
documents_path = Path("./scripts/input_data")
json_files: List[Path] = [
    p
    for p in documents_path.iterdir()
    if p.suffixes == [".json"] or p.name.endswith(".json")
]

data = []
for json_file in json_files:
    with json_file.open("r", encoding="utf-8") as f:
        fileObject = json.load(f)
        data.append(fileObject)

print(f"Loaded {len(data)} documents from {documents_path}")

logger = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO)


def get_string_hash(input_string: str) -> str:
    """Return a SHA-256 hex digest for a given string."""
    return hashlib.sha256(input_string.encode("utf-8")).hexdigest()


def clean_doc(document: Dict[str, Any]) -> Dict[str, Any]:
    """Remove MongoDB-specific fields from a document in-place and return it."""
    fields_to_remove = ["_id", "inc_id", "__v", "edited"]
    for field in fields_to_remove:
        document.pop(field, None)

    # Clean annotation sets safely
    ann_sets = document.get("annotation_sets", {})
    for annset_name, annset in ann_sets.items():
        if isinstance(annset, dict):
            annset.pop("_id", None)
            annotations = annset.get("annotations", [])
            for annotation in annotations:
                annotation.pop("_id", None)
                annotation.pop("annotationSetId", None)
    return document


def remove_surrogates(text: str) -> str:
    if not isinstance(text, str):
        return text
    encoded_text = text.encode("utf-16", "surrogatepass")
    return encoded_text.decode("utf-16", errors="ignore")


def process_doc_for_mongo(obj: Dict[str, Any], database) -> None:
    """Prepare and insert document, annotation sets and annotations into MongoDB."""
    try:
        text = obj.get("text", "")
        doc_id = get_string_hash(text)
        document = {
            "text": remove_surrogates(text),
            "preview": remove_surrogates(text[:100] + "..."),
            "name": remove_surrogates(obj.get("name", "")),
            "features": obj.get("features", {}),
            "offset_type": obj.get("offset_type"),
            "id": doc_id,
        }
        document.pop("_id", None)
        database["documents"].insert_one(document)

        annotation_sets = obj.get("annotation_sets", {})
        annset_collection = database["annotationSets"]
        annset_id_map = {}
        for name, annset in annotation_sets.items():
            ann_record = {
                "name": name,
                "docId": doc_id,
                "next_annid": annset.get("next_annid", 1),
            }
            ann_record.pop("_id", None)
            inserted = annset_collection.insert_one(ann_record)
            annset_id_map[name] = inserted.inserted_id

        annotation_collection = database["annotations"]
        for name, annset in annotation_sets.items():
            for annotation in annset.get("annotations", []):
                try:
                    annotation["annotationSetId"] = annset_id_map[name]
                    if "features" in annotation and "mention" in annotation["features"]:
                        annotation["features"]["mention"] = remove_surrogates(
                            annotation["features"]["mention"]
                        )
                    annotation.pop("_id", None)
                    annotation_collection.insert_one(annotation)
                except Exception as e:
                    logger.exception(
                        "Error inserting annotation for doc %s: %s", doc_id, e
                    )
    except Exception as e:
        logger.exception("Error processing document to Mongo: %s", e)


def merge_duplicate_annotation_sets(document):
    """Merge clusters with identical titles (case-insensitive) inside document.features.clusters."""
    features = document.get("features", {})
    clusters = features.get("clusters")
    if not clusters or not isinstance(clusters, dict):
        logger.debug("No clusters structure found; skipping merge")
        return document

    total_clusters_merged = 0
    total_mentions_moved = 0
    for ann_set_name, cluster_list in clusters.items():
        if not isinstance(cluster_list, list):
            continue
        title_map = {}
        new_clusters = []
        for cluster in cluster_list:
            title = cluster.get("title")
            if not title:
                new_clusters.append(cluster)
                continue
            key = title.lower().strip()
            if key in title_map:
                primary = title_map[key]
                mentions = cluster.get("mentions", [])
                if mentions:
                    primary.setdefault("mentions", []).extend(mentions)
                    total_mentions_moved += len(mentions)
                    total_clusters_merged += 1
            else:
                title_map[key] = cluster
                new_clusters.append(cluster)
        clusters[ann_set_name] = new_clusters
        logger.info("After merging %s clusters in %s", len(new_clusters), ann_set_name)

    if total_clusters_merged:
        logger.info(
            "Merged %s clusters and moved %s mentions in total",
            total_clusters_merged,
            total_mentions_moved,
        )
    return document


# Load environment variables from .env file
load_dotenv()

# Get MongoDB credentials from environment variables
MONGO_PASSWORD = os.environ.get("MONGO_ROOT_PASSWORD")

# Construct Mongo URI using credentials
MONGO_URI = (
    f"mongodb://root:{MONGO_PASSWORD}@127.0.0.1:27018/" if MONGO_PASSWORD else None
)
DATABASE_NAME = "dave"

client = MongoClient(MONGO_URI)
db = client[DATABASE_NAME]

for doc in tqdm(data):
    try:
        doc = clean_doc(doc)
    except Exception as e:
        logger.exception("Error cleaning document %s: %s", doc.get("id", "unknown"), e)
        continue

    try:
        doc = merge_duplicate_annotation_sets(doc)
    except Exception as e:
        logger.exception(
            "Error merging duplicate annotation sets for doc %s: %s",
            doc.get("id", "unknown"),
            e,
        )

    try:
        process_doc_for_mongo(doc, db)
    except Exception as e:
        logger.exception(
            "Error processing doc to Mongo %s: %s", doc.get("id", "unknown"), e
        )
