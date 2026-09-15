const swaggerJsdoc = require("swagger-jsdoc");

const options = {
  definition: {
    openapi: "3.0.0",
    info: {
      title: "Clone Manager.io API",
      version: "1.0.0",
      description: "Dokumentasi API otomatis untuk backend Clone Manager.io",
    },
    servers: [{ url: "http://localhost:4000", description: "Local development" }],
    components: {
      securitySchemes: {
        bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT" },
      },
    },
  },
  apis: ["./src/routes/*.js"], // file yang di-scan untuk komentar dokumentasi
};

module.exports = swaggerJsdoc(options);