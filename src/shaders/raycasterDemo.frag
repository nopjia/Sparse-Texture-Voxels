//---------------------------------------------------------
// SHADER CONSTANTS
//---------------------------------------------------------

#define EPS       0.0001
#define PI        3.14159265
#define HALFPI    1.57079633
#define ROOTTHREE 1.73205081

#define EQUALS(A,B) ( abs((A)-(B)) < EPS )
#define EQUALSZERO(A) ( ((A)<EPS) && ((A)>-EPS) )


//---------------------------------------------------------
// SHADER VARS
//---------------------------------------------------------

layout (location = 0, index = 0) out vec4 fragColor;
layout(binding = COLOR_TEXTURE_POSX_3D_BINDING) uniform sampler3D tVoxColorPosX;
layout(binding = COLOR_TEXTURE_NEGX_3D_BINDING) uniform sampler3D tVoxColorNegX;
layout(binding = COLOR_TEXTURE_POSY_3D_BINDING) uniform sampler3D tVoxColorPosY;
layout(binding = COLOR_TEXTURE_NEGY_3D_BINDING) uniform sampler3D tVoxColorNegY;
layout(binding = COLOR_TEXTURE_POSZ_3D_BINDING) uniform sampler3D tVoxColorPosZ;
layout(binding = COLOR_TEXTURE_NEGZ_3D_BINDING) uniform sampler3D tVoxColorNegZ;
in vec2 vUV;

const uint MAX_STEPS = 64;
const float ALPHA_THRESHOLD = 0.95;
const float TRANSMIT_MIN = 0.05;
const float TRANSMIT_K = 8.0;

float gStepSize;

// DEBUGTEST: change to uniform later
const int LIGHT_NUM = 1;
vec3 gLightPos[LIGHT_NUM];
vec3 gLightCol[LIGHT_NUM];


//---------------------------------------------------------
// PROGRAM
//---------------------------------------------------------

// cube intersect
bool cubeIntersect(vec3 bMin, vec3 bMax, vec3 ro, vec3 rd, out float t) {    
    vec3 tMin = (bMin-ro) / rd;
    vec3 tMax = (bMax-ro) / rd;
    vec3 t1 = min(tMin, tMax);
    vec3 t2 = max(tMin, tMax);
    float tNear = max(max(t1.x, t1.y), t1.z);
    float tFar = min(min(t2.x, t2.y), t2.z);
    t = 0.0;
    if (tNear<tFar && tFar>0.0) {
        t = tNear>0.0 ? tNear : tFar;
        return true;
    }
    
    return false;
}

// cube intersect, but t returns intersect of volume, not just sides
bool cubeVolumeIntersect(vec3 bMin, vec3 bMax, vec3 ro, vec3 rd, out float t) {    
    vec3 tMin = (bMin-ro) / rd;
    vec3 tMax = (bMax-ro) / rd;
    vec3 t1 = min(tMin, tMax);
    vec3 t2 = max(tMin, tMax);
    float tNear = max(max(t1.x, t1.y), t1.z);
    float tFar = min(min(t2.x, t2.y), t2.z);
    t = 0.0;
    if (tNear<tFar && tFar>0.0) {
        // difference here
        // if inside, instead of returning far plane, return ray origin
        t = tNear>0.0 ? tNear : 0.0;
        return true;
    }
    
    return false;
}

// special case, for optimization
bool textureVolumeIntersect(vec3 ro, vec3 rd, out float t) {    
    vec3 tMin = -ro / rd;
    vec3 tMax = (1.0-ro) / rd;
    vec3 t1 = min(tMin, tMax);
    vec3 t2 = max(tMin, tMax);
    float tNear = max(max(t1.x, t1.y), t1.z);
    float tFar = min(min(t2.x, t2.y), t2.z);
    t = 0.0;
    if (tNear<tFar && tFar>0.0) {
        // difference here
        // if inside, instead of returning far plane, return ray origin
        t = tNear>0.0 ? tNear : 0.0;
        return true;
    }
    
    return false;
}

// simple alpha blending
vec4 raymarchSimple(vec3 ro, vec3 rd) {
  vec3 step = rd*gStepSize;
  vec3 pos = ro;
  
  vec4 color = vec4(0.0);
  
  for (int i=0; i<MAX_STEPS; ++i) {

    vec4 src = textureLod(tVoxColorPosX, pos, uCurrentMipLevel);
    src.a *= gStepSize;  // factor by how steps per voxel diag


    // alpha blending
    vec4 dst = color;
    color.a = src.a + dst.a*(1.0-src.a);
    color.rgb = EQUALSZERO(color.a) ? vec3(0.0) : 
        (src.rgb*src.a + dst.rgb*dst.a*(1.0-src.a)) / color.a;

    pos += step;
    
    if (color.a > ALPHA_THRESHOLD ||
      pos.x > 1.0 || pos.x < 0.0 ||
      pos.y > 1.0 || pos.y < 0.0 ||
      pos.z > 1.0 || pos.z < 0.0)
      break;
  }
  
  return color;
}

// raymarch to get transmittance
float getTransmittance(vec3 ro, vec3 rd) {
  vec3 step = rd*gStepSize;
  vec3 pos = ro;
  
  float tm = 1.0;
  
  for (int i=0; i<MAX_STEPS; ++i) {
    tm *= exp( -TRANSMIT_K*gStepSize*textureLod(tVoxColorPosX, pos, uCurrentMipLevel).a );

    pos += step;
    
    if (tm < TRANSMIT_MIN ||
      pos.x > 1.0 || pos.x < 0.0 ||
      pos.y > 1.0 || pos.y < 0.0 ||
      pos.z > 1.0 || pos.z < 0.0)
      break;
  }
  
  return tm;
}

// raymarch transmittance from r0 to r1
float getTransmittanceToDst(vec3 r0, vec3 r1) {
  vec3 dir = normalize(r1-r0);
  vec3 step = dir*gStepSize;
  vec3 pos = r0;
  
  float tm = 1.0;
  
  for (int i=0; i<MAX_STEPS; ++i) {
    tm *= exp( -TRANSMIT_K*gStepSize*textureLod(tVoxColorPosX, pos, uCurrentMipLevel).a );

    pos += step;

    // check if pos passed r1
    if ( dot((r1-pos),dir) < 0.0 )
        break;
  }
  
  return tm;
}

// raymarch with light transmittance
vec4 raymarchLight(vec3 ro, vec3 rd) {
  vec3 step = rd*gStepSize;
  vec3 pos = ro;
    
  vec3 col = vec3(0.0);   // accumulated color
  float tm = 1.0;         // accumulated transmittance
  
  for (int i=0; i<MAX_STEPS; ++i) {
    vec4 texel = textureLod(tVoxColorPosX, pos, uCurrentMipLevel);

    // delta transmittance
    float dtm = exp( -TRANSMIT_K*gStepSize*texel.a );
    tm *= dtm;
    
    // get contribution per light
    for (int k=0; k<LIGHT_NUM; ++k) {
      vec3 lo = gLightPos[k];
      vec3 ld = normalize(pos-lo);
      float t = 0.0;
      textureVolumeIntersect(lo, ld, t);
      float ltm = getTransmittanceToDst(lo+ld*(t+EPS),pos);
      
      col += (1.0-dtm) * texel.rgb*gLightCol[k] * tm * ltm;
    }
    
    pos += step;
    
    if (tm < TRANSMIT_MIN ||
      pos.x > 1.0 || pos.x < 0.0 ||
      pos.y > 1.0 || pos.y < 0.0 ||
      pos.z > 1.0 || pos.z < 0.0)
      break;
  }
  
  float alpha = 1.0-tm;
  return vec4( alpha==0 ? col : col/alpha , alpha);
}

void main()
{
    // DEBUGTEST: manually init lights
    gLightCol[0] = vec3(1.0, 0.9, 0.8);
    gLightPos[0] = vec3(0.0, 2.0, 0.0);
    gLightPos[0].x = 2.0*sin(uTime);
    gLightPos[0].z = 2.0*cos(uTime);

	// flip uv.y
	vec2 uv = vec2(vUV.x, 1.0-vUV.y);

    // camera ray
    vec3 C = normalize(uCamLookAt-uCamPos);

    // calc A (screen x)
    // calc B (screen y) then scale down relative to aspect
    // fov is for screen x axis
    vec3 A = normalize(cross(C,uCamUp));
    vec3 B = -1.0/(uAspect)*normalize(cross(A,C));

    // scale by FOV
    float tanFOV = tan(radians(uFOV));

    vec3 ro = uCamPos+C
        + (2.0*uv.x-1.0)*tanFOV*A 
        + (2.0*uv.y-1.0)*tanFOV*B;
    vec3 rd = normalize(ro-uCamPos);

    // output color
    vec4 cout;

    // calc entry point
    float t = 0.0;
    if (textureVolumeIntersect(uCamPos, rd, t)) {
        // step_size = root_three / max_steps ; to get through diagonal
        gStepSize = ROOTTHREE / float(MAX_STEPS);

        cout = raymarchLight(uCamPos+rd*(t+EPS), rd);
    }
    else {
        cout = vec4(0.0);
    }

    // background color
    vec4 bg = vec4(vec3(0.0, 0.0, (1.0-vUV.y)/2.0), 1.0);

    // alpha blend cout over bg
    bg.rgb = mix(bg.rgb, cout.rgb, cout.a);
    fragColor = bg;
}