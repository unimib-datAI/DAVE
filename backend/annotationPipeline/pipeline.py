from pathlib import Path
from typing import Dict, Any
import json
import difflib
import pandas as pd
from tqdm import tqdm

from refined.inference.processor import Refined, Span


class PipelineInformationExtractorRefined:
    def __init__(self):
        self.model = Refined.from_pretrained(
            model_name="wikipedia_model_with_numbers", entity_set="wikipedia"
        )

    def _create_span(self, span: Span, index: int):
        entity = span.predicted_entity
        features_object = (
            {
                "linking": {
                    "title": entity.wikipedia_entity_title,
                    "top_candidate": {
                        "url": "https://www.wikidata.org/wiki/"
                        + entity.wikidata_entity_id,
                    },
                    "is_nil": False,
                },
                "text": span.text,
                "title": entity.wikipedia_entity_title,
                "url": "https://www.wikidata.org/wiki/" + entity.wikidata_entity_id,
            }
            if entity
            and getattr(entity, "wikidata_entity_id", None)
            and getattr(entity, "wikipedia_entity_title", None)
            else {"text": span.text, "linking": {"is_nil": True}}
        )
        span_type = span.coarse_mention_type or "UNKNOWN"
        base_obj = {
            "text": span.text,
            "start": span.start,
            "end": span.start + span.ln,
            "type": span_type,
            "id": index,
        }
        if features_object is not None:
            base_obj["features"] = features_object
        return base_obj

    @staticmethod
    def _is_valid_date(date_time: str):
        return pd.to_datetime(date_time, errors="coerce") is not pd.NaT

    def _convert_to_gate(self, text, entities):
        return {
            "text": text,
            "annotation_sets": {"entities_": {"annotations": entities}},
        }

    def _extract_spans(self, text: str):
        return [
            self._create_span(span, index)
            for index, span in enumerate(self.model.process_text(text))
            if len(span.text) > 2
        ]

    def _convert_to_w3c(self, text: str, spans, set_name: str = "GateNLP_NER"):
        annotations = []
        for span in spans:
            features = span.get("features", {})
            linking = features.get("linking", {})
            w3c_features: Dict[str, Any] = {"text": features.get("text", span.get("text"))}
            if not linking.get("is_nil", True):
                wikidata_id = (linking.get("top_candidate", {}).get("url") or "").rsplit(
                    "/", 1
                )[-1] or None
                w3c_features["entity"] = {
                    "id": f"wd:{wikidata_id}" if wikidata_id else None,
                    "name": linking.get("title"),
                    "match": True,
                }
            annotations.append(
                {
                    "id": span["id"],
                    "type": span["type"],
                    "target": {
                        "selector": {
                            "type": "TextPositionSelector",
                            "start": span["start"],
                            "end": span["end"],
                        }
                    },
                    "features": w3c_features,
                }
            )
        return {
            "label": text,
            "metadata": [],
            "annotations": {set_name: annotations},
        }

    def process_w3c(self, docs: Dict[str, Any]) -> Dict[str, Any]:
        return {
            key: self._convert_to_w3c(value, self._extract_spans(value))
            for key, value in tqdm(docs.items())
        }

    def process(self, docs: Dict[str, Any], save: bool = False) -> Dict[str, Any]:
        processed: Dict[str, Any] = {}
        out_dir = Path("output")
        out_dir.mkdir(parents=True, exist_ok=True)
        for key, value in tqdm(docs.items()):
            spans = self._extract_spans(value)
            if save:
                base = self._convert_to_gate(value, spans)
                clusters = self.cluster_mentions(base)
                base["features"] = {"clusters": {"entities_": clusters}}
                base["name"] = key
                base["preview"] = (
                    value[:100] + " ..." if len(value) > 100 else value + "..."
                )
                p = Path(key)
                target = out_dir / p
                target = target.with_suffix(".json")
                target.parent.mkdir(parents=True, exist_ok=True)
                with target.open("w", encoding="utf-8") as f:
                    json.dump(base, f, ensure_ascii=False)
            else:
                processed[key] = self._convert_to_gate(value, spans)
                clusters = self.cluster_mentions(processed[key])
                processed[key]["features"] = {"clusters": {"entities_": clusters}}
                processed[key]["name"] = key
                processed[key]["preview"] = (
                    value[:100] + " ..." if len(value) > 100 else value + "..."
                )

        return processed

    def cluster_mentions(
        self, gate_doc: Dict[str, Any], text_similarity_threshold: float = 0.8
    ):
        annotations = (
            gate_doc.get("annotation_sets", {})
            .get("entities_", {})
            .get("annotations", [])
        )

        clusters = []
        used_indices = set()

        def _mention_info(idx, ann):
            mention_text = ann.get("features", {}).get("text") or ann.get("text") or ""
            mention_id = ann.get("id", idx)
            return mention_id, mention_text

        id_map = {}
        for i, ann in enumerate(annotations):
            url = (
                ann.get("features", {})
                .get("linking", {})
                .get("top_candidate", {})
                .get("url")
            )
            wid = None
            if url and isinstance(url, str):
                wid = url.split("/")[-1]
            if not wid:
                wid = ann.get("features", {}).get("wikidata_id")
            if wid:
                id_map.setdefault(wid, []).append(i)

        cluster_id = 1
        for wid, idxs in id_map.items():
            mentions = []
            for idx in idxs:
                ann = annotations[idx]
                mid, mtext = _mention_info(idx, ann)
                mentions.append({"id": mid, "mention": mtext})
                used_indices.add(idx)

            first_ann = annotations[idxs[0]]
            title = first_ann.get("features", {}).get("linking", {}).get("title") or wid
            ent_type = (
                first_ann.get("type")
                or first_ann.get("features", {}).get("entity_type")
                or "ENTITY"
            )

            clusters.append(
                {
                    "id": cluster_id,
                    "title": title,
                    "type": ent_type,
                    "nelements": len(mentions),
                    "mentions": mentions,
                }
            )
            cluster_id += 1

        for i, ann in enumerate(annotations):
            if i in used_indices:
                continue
            mid, mtext = _mention_info(i, ann)
            placed = False
            for cluster in clusters:
                rep_text = (
                    cluster["mentions"][0]["mention"] if cluster.get("mentions") else ""
                )
                ratio = difflib.SequenceMatcher(
                    None, mtext.lower(), rep_text.lower()
                ).ratio()
                if ratio >= text_similarity_threshold:
                    cluster["mentions"].append({"id": mid, "mention": mtext})
                    cluster["nelements"] = cluster.get("nelements", 0) + 1
                    placed = True
                    break
            if not placed:
                ent_type = (
                    ann.get("type")
                    or ann.get("features", {}).get("entity_type")
                    or "ENTITY"
                )
                clusters.append(
                    {
                        "id": cluster_id,
                        "title": mtext,
                        "type": ent_type,
                        "nelements": 1,
                        "mentions": [{"id": mid, "mention": mtext}],
                    }
                )
                cluster_id += 1

        return clusters
