import swaggerJsdoc from 'swagger-jsdoc';
import swaggerUi from 'swagger-ui-express';

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Documents API',
      version: '1.0.0',
      description: 'API documentation for the Documents service - manages documents, annotations, and annotation sets',
    },
    servers: [
      {
        url: `http://localhost:${process.env.DOCS_PORT || 3000}`,
        description: 'Development server',
      },
    ],
    components: {
      schemas: {
        Document: {
          type: 'object',
          properties: {
            id: {
              type: 'number',
              description: 'Unique document identifier'
            },
            name: {
              type: 'string',
              description: 'Document name'
            },
            text: {
              type: 'string',
              description: 'Full text content of the document'
            },
            preview: {
              type: 'string',
              description: 'Preview/excerpt of the document'
            },
            annotation_sets: {
              type: 'array',
              description: 'Array of annotation sets associated with the document',
              items: { type: 'object' }
            },
            features: {
              type: 'object',
              description: 'Additional features/metadata for the document'
            },
            offset_type: {
              type: 'string',
              description: 'Type of offset used for annotations'
            },
            elasticIndex: {
              type: 'string',
              description: 'Elasticsearch index name'
            },
          },
        },
        DocumentPage: {
          type: 'object',
          properties: {
            docs: {
              type: 'array',
              items: { $ref: '#/components/schemas/Document' }
            },
            totalDocs: { type: 'integer' },
            limit: { type: 'integer' },
            page: { type: 'integer' },
            totalPages: { type: 'integer' },
            hasNextPage: { type: 'boolean' },
            hasPrevPage: { type: 'boolean' },
          }
        },
        AnnotationSet: {
          type: 'object',
          properties: {
            _id: {
              type: 'string',
              description: 'Annotation set ID'
            },
            docId: {
              type: 'number',
              description: 'Reference to parent document'
            },
            name: {
              type: 'string',
              description: 'Name of the annotation set'
            },
            annotations: {
              type: 'array',
              description: 'Array of annotations',
              items: { $ref: '#/components/schemas/Annotation' }
            },
          },
        },
        Annotation: {
          type: 'object',
          properties: {
            _id: { type: 'string' },
            annotationSetId: { type: 'string' },
            type: { type: 'string' },
            start: { type: 'number' },
            end: { type: 'number' },
            features: { type: 'object' },
          }
        },
        CreateDocumentRequest: {
          type: 'object',
          required: ['text', 'name'],
          properties: {
            text: { type: 'string' },
            annotation_sets: { type: 'array', items: { type: 'object' } },
            preview: { type: 'string' },
            name: { type: 'string' },
            features: { type: 'object' },
            offset_type: { type: 'string' },
            elasticIndex: { type: 'string' },
          }
        },
        UpdateDocumentRequest: {
          type: 'object',
          properties: {
            text: { type: 'string' },
            annotation_sets: { type: 'array', items: { type: 'object' } },
            preview: { type: 'string' },
            name: { type: 'string' },
            features: { type: 'object' },
            offset_type: { type: 'string' },
            elasticIndex: { type: 'string' },
          }
        },
        MoveEntitiesRequest: {
          type: 'object',
          required: ['entities', 'annotationSet', 'sourceCluster', 'destinationCluster'],
          properties: {
            entities: {
              type: 'array',
              items: { type: 'string' }
            },
            annotationSet: { type: 'string' },
            sourceCluster: { type: 'string' },
            destinationCluster: { type: 'string' },
          }
        },
        UpdateFeatureRequest: {
          type: 'object',
          required: ['key'],
          properties: {
            key: { type: 'string' }
          }
        },
        Error: {
          type: 'object',
          properties: {
            message: { type: 'string' },
            error: { type: 'string' },
          },
        },
      },
      parameters: {
        documentId: {
          in: 'path',
          name: 'id',
          required: true,
          schema: { type: 'number' },
          description: 'Document ID'
        },
        annotationSetId: {
          in: 'path',
          name: 'annotationSetId',
          required: true,
          schema: { type: 'string' },
          description: 'Annotation Set ID'
        }
      }
    },
    tags: [
      {
        name: 'Documents',
        description: 'Document management endpoints'
      },
      {
        name: 'Save',
        description: 'Save operations for annotations'
      }
    ]
  },
  apis: ['./src/api/*.js'], // Path to the API routes with JSDoc comments
};

const swaggerSpec = swaggerJsdoc(options);

export const setupSwagger = (app) => {
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
    customCss: '.swagger-ui .topbar { display: none }',
    customSiteTitle: "Documents API Documentation"
  }));
  console.log(`📚 Swagger documentation available at http://localhost:${process.env.DOCS_PORT || 3000}/api-docs`);
};
