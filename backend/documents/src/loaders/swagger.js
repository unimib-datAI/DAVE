import swaggerJsdoc from "swagger-jsdoc";
import swaggerUi from "swagger-ui-express";

const options = {
  definition: {
    openapi: "3.0.0",
    info: {
      title: "Documents API",
      version: "1.0.0",
      description:
        "API documentation for the Documents service - manages documents, annotations, and annotation sets",
    },
    servers: [
      {
        url: `http://localhost:${process.env.DOCS_PORT || 3000}`,
        description: "Development server",
      },
    ],
    components: {
      schemas: {
        Document: {
          type: "object",
          properties: {
            id: {
              type: "string",
              description: "Unique document identifier (hex string)",
              example:
                "d038bf8c87a223f191dd02dd7e811045faee1df21a713537fd94a281fac19b81",
            },
            name: {
              type: "string",
              description: "Document name",
            },
            text: {
              type: "string",
              description: "Full text content of the document",
            },
            preview: {
              type: "string",
              description: "Preview/excerpt of the document",
            },
            annotation_sets: {
              type: "array",
              description:
                "Array of annotation sets associated with the document",
              items: { type: "object" },
            },
            features: {
              type: "object",
              description: "Additional features/metadata for the document",
            },
            offset_type: {
              type: "string",
              description: "Type of offset used for annotations",
            },
            elasticIndex: {
              type: "string",
              description: "Elasticsearch index name",
            },
          },
        },
        DocumentPage: {
          type: "object",
          properties: {
            docs: {
              type: "array",
              items: { $ref: "#/components/schemas/Document" },
            },
            totalDocs: { type: "integer" },
            limit: { type: "integer" },
            page: { type: "integer" },
            totalPages: { type: "integer" },
            hasNextPage: { type: "boolean" },
            hasPrevPage: { type: "boolean" },
          },
        },
        AnnotationSet: {
          type: "object",
          properties: {
            _id: {
              type: "string",
              description: "Annotation set ID",
            },
            docId: {
              type: "string",
              description: "Reference to parent document (hex string ID)",
            },
            name: {
              type: "string",
              description: "Name of the annotation set",
            },
            annotations: {
              type: "array",
              description: "Array of annotations",
              items: { $ref: "#/components/schemas/Annotation" },
            },
          },
        },
        Annotation: {
          type: "object",
          properties: {
            _id: { type: "string" },
            annotationSetId: { type: "string" },
            type: { type: "string" },
            start: { type: "number" },
            end: { type: "number" },
            features: { type: "object" },
          },
        },
        CreateDocumentRequest: {
          type: "object",
          required: ["text", "name"],
          properties: {
            text: { type: "string" },
            annotation_sets: { type: "array", items: { type: "object" } },
            preview: { type: "string" },
            name: { type: "string" },
            features: { type: "object" },
            offset_type: { type: "string" },
            elasticIndex: { type: "string" },
          },
        },
        UpdateDocumentRequest: {
          type: "object",
          properties: {
            text: { type: "string" },
            annotation_sets: { type: "array", items: { type: "object" } },
            preview: { type: "string" },
            name: { type: "string" },
            features: { type: "object" },
            offset_type: { type: "string" },
            elasticIndex: { type: "string" },
          },
        },
        MoveEntitiesRequest: {
          type: "object",
          required: [
            "entities",
            "annotationSet",
            "sourceCluster",
            "destinationCluster",
          ],
          properties: {
            entities: {
              type: "array",
              items: { type: "string" },
            },
            annotationSet: { type: "string" },
            sourceCluster: { type: "string" },
            destinationCluster: { type: "string" },
          },
        },
        UpdateFeatureRequest: {
          type: "object",
          required: ["key"],
          properties: {
            key: { type: "string" },
          },
        },
        Error: {
          type: "object",
          properties: {
            message: { type: "string" },
            error: { type: "string" },
          },
        },
        KeycloakLoginRequest: {
          type: "object",
          required: ["username", "password"],
          properties: {
            username: {
              type: "string",
              description: "Keycloak username or email address",
              example: "user@example.com",
            },
            password: {
              type: "string",
              format: "password",
              description: "User password",
              example: "yourpassword",
            },
          },
        },
        KeycloakTokenResponse: {
          type: "object",
          properties: {
            access_token: {
              type: "string",
              description:
                "Keycloak JWT access token. Use as Bearer token for API calls.",
            },
            refresh_token: {
              type: "string",
              description:
                "Keycloak refresh token for obtaining new access tokens.",
            },
            expires_in: {
              type: "integer",
              description: "Access token lifetime in seconds.",
              example: 300,
            },
            refresh_expires_in: {
              type: "integer",
              description: "Refresh token lifetime in seconds.",
            },
            token_type: {
              type: "string",
              example: "Bearer",
            },
            scope: {
              type: "string",
              example: "openid profile email",
            },
          },
        },
        LocalLoginRequest: {
          type: "object",
          required: ["email", "password"],
          properties: {
            email: {
              type: "string",
              format: "email",
              example: "admin@daveadmin.com",
            },
            password: {
              type: "string",
              format: "password",
              example: "daveAdmin42!",
            },
          },
        },
        LocalTokenResponse: {
          type: "object",
          properties: {
            accessToken: { type: "string", description: "HS256 access token." },
            refreshToken: { type: "string" },
            expiresIn: {
              type: "integer",
              description: "Access token lifetime in seconds.",
            },
            user: { $ref: "#/components/schemas/UserInfo" },
          },
        },
        RefreshRequest: {
          type: "object",
          required: ["refreshToken"],
          properties: {
            refreshToken: {
              type: "string",
              description: "A previously issued refresh token.",
            },
          },
        },
        UserInfo: {
          type: "object",
          properties: {
            userId: { type: "string" },
            email: { type: "string" },
            name: { type: "string" },
            roles: { type: "array", items: { type: "string" } },
          },
        },
      },
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "JWT",
          description:
            "Paste a Keycloak access_token obtained from POST /api/auth/keycloak-login",
        },
      },
      parameters: {
        documentId: {
          in: "path",
          name: "id",
          required: true,
          schema: { type: "string" },
          description: "Document ID (hex string)",
          example:
            "d038bf8c87a223f191dd02dd7e811045faee1df21a713537fd94a281fac19b81",
        },
        annotationSetId: {
          in: "path",
          name: "annotationSetId",
          required: true,
          schema: { type: "string" },
          description: "Annotation Set ID",
        },
      },
    },
    security: [{ bearerAuth: [] }],
    tags: [
      {
        name: "Auth",
        description:
          "Authentication — local (email/password) and Keycloak (ROPC direct login)",
      },
      {
        name: "Documents",
        description: "Document management endpoints",
      },
      {
        name: "Save",
        description: "Save operations for annotations",
      },
      {
        name: "Collections",
        description: "Collection management endpoints",
      },
      {
        name: "Search",
        description:
          "Full-text faceted search over documents via the Elasticsearch indexer",
      },
      {
        name: "RAG",
        description:
          "Retrieval-Augmented Generation — vector retrieval + LLM text generation in a single call",
      },
    ],
  },
  apis: ["./src/api/*.js"], // Path to the API routes with JSDoc comments
};

const swaggerSpec = swaggerJsdoc(options);

const LOGIN_FORM_JS = `
(function () {
  function injectLoginForm() {
    var infoContainer = document.querySelector('.swagger-ui .information-container');
    if (!infoContainer || document.getElementById('kc-login-widget')) return;

    var widget = document.createElement('div');
    widget.id = 'kc-login-widget';
    widget.style.cssText = [
      'display:flex', 'flex-wrap:wrap', 'gap:8px', 'align-items:flex-end',
      'padding:12px 16px', 'margin:12px 0 0',
      'background:#fafafa', 'border:1px solid #d9d9d9', 'border-radius:4px',
    ].join(';');
    widget.innerHTML = [
      '<span style="font-size:13px;font-weight:600;flex-basis:100%;color:#3b4151">',
        'Quick Keycloak Login',
      '</span>',
      '<div style="display:flex;flex-direction:column;gap:2px">',
        '<label style="font-size:11px;color:#3b4151">Username / email</label>',
        '<input id="kc-username" type="text" placeholder="user@example.com"',
          ' style="padding:5px 8px;border:1px solid #ccc;border-radius:3px;font-size:13px;width:200px"/>',
      '</div>',
      '<div style="display:flex;flex-direction:column;gap:2px">',
        '<label style="font-size:11px;color:#3b4151">Password</label>',
        '<input id="kc-password" type="password" placeholder="password"',
          ' style="padding:5px 8px;border:1px solid #ccc;border-radius:3px;font-size:13px;width:160px"/>',
      '</div>',
      '<button id="kc-login-btn"',
        ' style="padding:6px 18px;background:#4990e2;color:#fff;border:none;border-radius:3px;font-size:13px;cursor:pointer">',
        'Login',
      '</button>',
      '<span id="kc-login-status" style="font-size:12px"></span>',
    ].join('');

    infoContainer.appendChild(widget);

    document.getElementById('kc-login-btn').addEventListener('click', function () {
      var username = document.getElementById('kc-username').value.trim();
      var password = document.getElementById('kc-password').value;
      var status   = document.getElementById('kc-login-status');

      if (!username || !password) {
        status.style.color = '#e74c3c';
        status.textContent = 'Username and password are required.';
        return;
      }

      status.style.color = '#888';
      status.textContent = 'Logging in…';

      fetch('/api/auth/keycloak-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username, password: password }),
      })
        .then(function (res) {
          return res.json().then(function (body) {
            if (!res.ok) throw new Error(body.message || 'Login failed');
            return body;
          });
        })
        .then(function (data) {
          // Authorise all bearer-protected operations without opening the modal
          window.ui.preauthorizeApiKey('bearerAuth', data.access_token);
          status.style.color = '#27ae60';
          status.textContent = '✓ Authenticated (expires in ' + data.expires_in + 's)';
          // Clear the password field for safety
          document.getElementById('kc-password').value = '';
        })
        .catch(function (err) {
          status.style.color = '#e74c3c';
          status.textContent = '✗ ' + err.message;
        });
    });

    // Allow submitting the form with Enter
    widget.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') document.getElementById('kc-login-btn').click();
    });
  }

  // Poll until both the DOM and window.ui are ready
  var attempts = 0;
  var timer = setInterval(function () {
    attempts++;
    if (window.ui) {
      clearInterval(timer);
      injectLoginForm();
    } else if (attempts > 100) {
      clearInterval(timer); // give up after ~5 s
    }
  }, 50);
})();
`;

export const setupSwagger = (app) => {
  app.use(
    "/api-docs",
    swaggerUi.serve,
    swaggerUi.setup(swaggerSpec, {
      customCss: ".swagger-ui .topbar { display: none }",
      customSiteTitle: "Documents API Documentation",
      customJsStr: LOGIN_FORM_JS,
    }),
  );
  console.log(
    `Swagger documentation available at http://localhost:${process.env.DOCS_PORT || 3000}/api-docs`,
  );
};
