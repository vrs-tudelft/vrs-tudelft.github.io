/* The air as filled slabs over the city: one slab per layer (Layers, with its edges drawn) or slices of 2 m
   (Smooth), each in the colour of the air at its height, unlit so every face is equally see-through, and as
   see-through as its share of the column: the slider sets the opacity of a fifth of the column, so the look does
   not depend on the number of layers. Seen from above the slabs add up layer by layer, so the layers differ.
   The top of the air is lifted a few centimetres above the top edge, so a roof at that height does not flicker
   against it. Shared by the Findings view (3d/viewer.js) and the simulator's city (js/sim-city.js). */
import * as THREE from 'three';

export class AirVolume {
  constructor(){
    this.group=new THREE.Group();this.key='';this.size=null;
  }
  /* the slabs: footprint x0-x1, z0-z1 (scene metres), the layer edges (m NAP), smooth or layers */
  setSlabs(x0,x1,z0,z1,edges,smooth){
    const bot=edges[0],top=edges[edges.length-1];
    let z=edges.slice();
    if(smooth){const n=Math.max(1,Math.round((top-bot)/2));z=[];for(let i=0;i<=n;i++)z.push(bot+i*(top-bot)/n);}
    const key=[x0,x1,z0,z1,smooth,z.join(',')].join('|');if(key===this.key)return;this.key=key;
    this.group.children.forEach(o=>o.traverse(n=>{n.geometry?.dispose();n.material?.dispose();}));this.group.clear();
    this.size=top-bot;
    for(let k=0;k<z.length-1;k++){
      const lo=z[k],hi=k===z.length-2?z[k+1]+.05:z[k+1];
      const g=new THREE.BoxGeometry(x1-x0,Math.max(.2,hi-lo-(smooth?0:.3)),z1-z0);
      const m=new THREE.Mesh(g,new THREE.MeshBasicMaterial({color:0xffffff,transparent:true,depthWrite:false}));
      m.position.set((x0+x1)/2,(lo+hi)/2,(z0+z1)/2);m.renderOrder=2;m.userData.zc=(z[k]+z[k+1])/2;m.userData.h=z[k+1]-z[k];
      if(!smooth)m.add(new THREE.LineSegments(new THREE.EdgesGeometry(g),new THREE.LineBasicMaterial({color:0x33414d,transparent:true,opacity:.5})));
      this.group.add(m);
    }
  }
  /* colour each slab by the air at its centre (colourAt(z) -> [r,g,b] 0-255) at the slider's opacity */
  paint(colourAt,op){
    const fifth=this.size/5,c=new THREE.Color();
    this.group.children.forEach(m=>{
      const v=colourAt(m.userData.zc);m.material.color.copy(c.setRGB(v[0]/255,v[1]/255,v[2]/255,THREE.SRGBColorSpace));
      m.material.opacity=op>=.999?1:1-Math.pow(1-op,m.userData.h/fifth);
      m.material.transparent=op<.999;m.material.depthWrite=op>=.999;
    });
  }
  render(renderer,scene,camera){renderer.render(scene,camera);}
}
