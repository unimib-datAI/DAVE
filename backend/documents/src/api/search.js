import { Router } from "express";
import { asyncRoute } from "../utils/async-route";
import { z } from "zod";
import { validateRequest } from "zod-express-middleware";
import axios from "axios";

const route = Router();

const facetedSearchQuerySchema = z.object({
  text: z.string().optional(),
  collectionId: z.string().optional(),
});

const facetedSearchBodySchema = z.object({
  metadata: z
    .array(
      z.object({
        value: z.string(),
        type: z.string(),
      }),
    )
    .default([]),
  annotations: z
    .array(
      z.object({
        value: z.string(),
        type: z.string(),
      }),
    )
    .default([]),
  limit: z.number().min(1).max(100).optional(),
  page: z.number().min(1).optional(),
  isAnonymized: z.boolean().optional(),
  n_facets: z.number().min(1).optional(),
});

export default (app) => {
  app.use("/search", route);

  /**
   * @swagger
   * components:
   *   schemas:
   *     FacetFilter:
   *       type: object
   *       required:
   *         - value
   *         - type
   *       properties:
   *         value:
   *           type: string
   *           description: Filter value
   *           example: "Rome"
   *         type:
   *           type: string
   *           description: Filter category / entity type
   *           example: "Location"
   *     FacetChild:
   *       type: object
   *       properties:
   *         key:
   *           type: string
   *           description: Primary ids_ER value or display_name (for unlinked entities)
   *           example: "https://www.wikidata.org/wiki/Q220"
   *         display_name:
   *           type: string
   *           example: "Rome"
   *         is_linked:
   *           type: boolean
   *           example: true
   *         ids_ER:
   *           type: array
   *           items:
   *             type: string
   *           description: All entity-resolution IDs associated with this facet child
   *           example: ["https://www.wikidata.org/wiki/Q220"]
   *         doc_count:
   *           type: integer
   *           description: Number of documents containing this entity
   *           example: 5
   *     FacetGroup:
   *       type: object
   *       properties:
   *         key:
   *           type: string
   *           description: Entity type / facet category label
   *           example: "Location"
   *         n_children:
   *           type: integer
   *           description: Total number of distinct values under this facet group
   *           example: 12
   *         doc_count:
   *           type: integer
   *           description: Total number of documents covered by this facet group
   *           example: 42
   *         children:
   *           type: array
   *           items:
   *             $ref: '#/components/schemas/FacetChild'
   *     HitAnnotation:
   *       type: object
   *       properties:
   *         start:
   *           type: integer
   *           description: Character offset start of the annotation in the document text
   *           example: 120
   *         end:
   *           type: integer
   *           description: Character offset end of the annotation in the document text
   *           example: 124
   *         mention:
   *           type: string
   *           description: The raw text span of the annotation
   *           example: "Rome"
   *         type:
   *           type: string
   *           description: Entity type label
   *           example: "Location"
   *         id_ER:
   *           type: string
   *           description: Entity-resolution identifier (Wikidata URL or synthetic ID)
   *           example: "https://www.wikidata.org/wiki/Q220"
   *         display_name:
   *           type: string
   *           description: Human-readable name for the entity (may be omitted)
   *           example: "Rome"
   *     HitMetadata:
   *       type: object
   *       properties:
   *         type:
   *           type: string
   *           example: "author"
   *         value:
   *           type: string
   *           example: "John Doe"
   *     DocumentHit:
   *       type: object
   *       properties:
   *         _id:
   *           type: string
   *           description: Elasticsearch document ID
   *           example: "abc123"
   *         id:
   *           type: number
   *           description: Internal numeric document ID
   *           example: 42
   *         mongo_id:
   *           type: string
   *           description: MongoDB document ObjectId
   *           example: "6456c7d3e4b0c123456789ab"
   *         text:
   *           type: string
   *           description: Full or excerpted document text
   *         name:
   *           type: string
   *           description: Document name / title
   *         metadata:
   *           type: array
   *           items:
   *             $ref: '#/components/schemas/HitMetadata'
   *         annotations:
   *           type: array
   *           items:
   *             $ref: '#/components/schemas/HitAnnotation'
   *     FacetedSearchRequest:
   *       type: object
   *       properties:
   *         metadata:
   *           type: array
   *           description: Metadata filters – each item restricts results to documents where the metadata field `type` equals `value`.
   *           items:
   *             $ref: '#/components/schemas/FacetFilter'
   *           default: []
   *           example: []
   *         annotations:
   *           type: array
   *           description: Annotation filters – each item restricts results to documents containing an entity of the given `type` with the given `value`.
   *           items:
   *             $ref: '#/components/schemas/FacetFilter'
   *           default: []
   *           example: []
   *         limit:
   *           type: integer
   *           minimum: 1
   *           maximum: 100
   *           description: Maximum number of document hits to return per page (maps to documents_per_page in the indexer).
   *           default: 20
   *           example: 20
   *         page:
   *           type: integer
   *           minimum: 1
   *           description: 1-based page number for paginating through results.
   *           default: 1
   *           example: 1
   *         isAnonymized:
   *           type: boolean
   *           description: When true (default), the indexer searches the anonymized text field. Set to false to search deanonymized text.
   *           default: true
   *           example: true
   *         n_facets:
   *           type: integer
   *           minimum: 1
   *           description: Maximum number of children to return per facet group.
   *           default: 20
   *           example: 20
   *     FacetedSearchResponse:
   *       type: object
   *       properties:
   *         hits:
   *           type: array
   *           description: Matching document hits for the current page.
   *           items:
   *             $ref: '#/components/schemas/DocumentHit'
   *         facets:
   *           type: object
   *           description: Aggregated facets grouped by category.
   *           properties:
   *             annotations:
   *               type: array
   *               items:
   *                 $ref: '#/components/schemas/FacetGroup'
   *             metadata:
   *               type: array
   *               items:
   *                 $ref: '#/components/schemas/FacetGroup'
   *         pagination:
   *           type: object
   *           properties:
   *             current_page:
   *               type: integer
   *               example: 1
   *             total_hits:
   *               type: integer
   *               description: Total number of matching documents (across all pages).
   *               example: 157
   *             total_pages:
   *               type: integer
   *               example: 8
   *
   * /api/search/faceted:
   *   post:
   *     summary: Faceted document search
   *     description: |
   *       Performs a full-text, faceted search over documents stored in Elasticsearch.
   *       Results are paginated. The response includes the matching document hits for
   *       the requested page **and** aggregated facet groups (annotation entity types
   *       and metadata fields) that can be used to further filter results.
   *
   *       This endpoint replicates the behaviour of the frontend
   *       `search.facetedSearch` tRPC procedure and forwards the request to the
   *       internal Elasticsearch indexer service.
   *     tags: [Search]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: query
   *         name: text
   *         required: false
   *         schema:
   *           type: string
   *         description: Full-text search query. Leave empty to return all documents.
   *         example: "Battle of Waterloo"
   *       - in: query
   *         name: collectionId
   *         required: false
   *         schema:
   *           type: string
   *         description: Restrict results to a specific collection. Leave empty to search across all collections.
   *         example: ""
   *     requestBody:
   *       required: false
   *       content:
   *         application/json:
   *           schema:
   *             $ref: '#/components/schemas/FacetedSearchRequest'
   *           example:
   *             metadata: []
   *             annotations: []
   *             page: 1
   *             limit: 20
   *             isAnonymized: true
   *             n_facets: 20
   *     responses:
   *       200:
   *         description: Search completed successfully.
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/FacetedSearchResponse'
   *       400:
   *         description: Invalid request body (validation error).
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Error'
   *       401:
   *         description: Missing or invalid authentication token.
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Error'
   *       500:
   *         description: Search service is not configured on the server.
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Error'
   *       502:
   *         description: The Elasticsearch indexer returned an error or is unreachable.
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Error'
   */
  route.post(
    "/faceted",
    validateRequest({
      body: facetedSearchBodySchema,
      query: facetedSearchQuerySchema,
    }),
    asyncRoute(async (req, res) => {
      const {
        metadata = [],
        annotations = [],
        limit,
        page = 1,
        isAnonymized,
        n_facets = 20,
      } = req.body;
      // Both search term and collection filter come from query params for dedicated Swagger UI text boxes
      const text = (req.query.text ?? "").trim();
      const collectionId = req.query.collectionId ?? "";

      const nextjsUrl =
        process.env.NEXTJS_API_BASE_URL || "http://ui:3000/holmes24";
      const elasticIndex = process.env.ELASTIC_INDEX;

      if (!nextjsUrl || !elasticIndex) {
        return res
          .status(500)
          .json({ message: "Search service is not configured" });
      }

      try {
        const { data } = await axios.post(
          `${nextjsUrl}/api/elastic/index/${elasticIndex}/query`,
          {
            text,
            metadata: metadata ?? [],
            annotations: annotations ?? [],
            n_facets,
            page,
            // `collection_id` is required by the indexer — send empty string when not provided
            collection_id: collectionId ?? "",
            // map `limit` to the indexer's field name; fall back to 20
            documents_per_page: limit ?? 20,
            is_anonymized: isAnonymized ?? true,
          },
        );
        return res.json(data);
      } catch (err) {
        const status = err.response?.status;
        const message =
          err.response?.data?.detail?.[0]?.msg ||
          err.response?.data?.message ||
          err.response?.data?.error ||
          err.message ||
          "Error communicating with the search indexer";
        return res.status(status || 502).json({ message });
      }
    }),
  );
};
