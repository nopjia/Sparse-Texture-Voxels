#pragma once
#include <glf.hpp>

struct Vertex
{
    //aligned to 32 bytes
    glm::vec3 position;
    glm::vec3 normal;
    glm::vec2 UV;
};

/*
// 32 bytes total, because it's a union
union Vertex
{
    struct
    {
        //aligned to 32 bytes
        glm::vec3 position;
        glm::vec3 normal;
        glm::vec2 UV;
    };

    // Ignore these variables - they just make it easier to interoperate between different Vertex types. If I use a non-human-readable mesh format, these aren't necessary
    float weights[8];
    unsigned short indexes[8];
    unsigned short numJoints;
};


// 96 bytes
struct VertexSkeleton
{
    glm::vec3 position;
    glm::vec3 normal;
    glm::vec2 UV;

    float weights[8];
    unsigned short indexes[8];
    unsigned short numJoints;
    unsigned short padding[7]; // to align to 32 bytes
};
*/


struct Mesh
{
    glm::vec3 extents;
    float radius;
    
    unsigned int numVertices;
    unsigned int baseVertex;
    void* vertexData;

    unsigned int numElements;
    unsigned int baseElement;
    void* elementArrayData;

    // General properties
    unsigned int vertexSize;
    unsigned int elementSize;
    GLenum elementType;
    GLenum drawPrimitive;

    Mesh* nextLOD;
    Mesh* nextMeshGroup;

    unsigned int materialIndex;

    Mesh(void* vertexData, void* elementArrayData, glm::vec3& extents, GLenum drawPrimitive, unsigned int vertexSize, unsigned int numVertices, unsigned int elementSize, unsigned int numElements, unsigned int materialIndex)
    :        
        vertexData(vertexData),
        elementArrayData(elementArrayData),
        extents(extents), 
        radius(glm::distance(glm::vec3(0,0,0), extents)),
        drawPrimitive(drawPrimitive),
        baseVertex(baseVertex),
        vertexSize(vertexSize), 
        numVertices(numVertices), 
        elementSize(elementSize), 
        elementType(elementSize == 2 ? GL_UNSIGNED_SHORT : GL_UNSIGNED_INT),
        numElements(numElements),
        materialIndex(materialIndex),
        nextLOD(0),
        nextMeshGroup(0)
    {
        // Nothing
    }

    ~Mesh()
    {
        // Nothing
    }

    void setNextLOD(Mesh* mesh)
    {
        nextLOD = mesh;
    }

    void setNextMeshGroup(Mesh* meshGroup)
    {
        nextMeshGroup = meshGroup;
    }

};