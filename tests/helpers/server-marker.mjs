/** Next handles this virtual compile-time marker; standalone esbuild fixtures do not. */
/** @type {import('esbuild').Plugin} */
export const emptyServerMarkerPlugin={name:'next-server-marker',setup(builder){
 builder.onResolve({filter:/^server-only$/},()=>({path:'marker',namespace:'next-server-marker'}));
 builder.onLoad({filter:/.*/,namespace:'next-server-marker'},()=>({contents:''}));
}};
