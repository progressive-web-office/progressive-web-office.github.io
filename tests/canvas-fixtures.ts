/** A synthetic canvas with every node type, an unknown one and unknown fields. */
export const SAMPLE = `{
\t"nodes":[
\t\t{"id":"g1","type":"group","x":-40,"y":-40,"width":520,"height":300,"label":"Ideas","color":"4","futureField":true},
\t\t{"id":"t1","type":"text","text":"# Hello\\n\\nSome **bold** text","x":0,"y":0,"width":200,"height":120},
\t\t{"id":"f1","type":"file","file":"Notes/Plan.md","subpath":"#Goals","x":260,"y":0,"width":200,"height":120,"color":"#123abc"},
\t\t{"id":"l1","type":"link","url":"https://example.org","x":0,"y":400,"width":200,"height":80},
\t\t{"id":"x1","type":"sticker","x":600,"y":400,"width":50,"height":50,"emoji":"*"}
\t],
\t"edges":[
\t\t{"id":"e1","fromNode":"t1","fromSide":"right","toNode":"f1","toSide":"left","label":"leads to","color":"1"},
\t\t{"id":"e2","fromNode":"t1","toNode":"l1","toEnd":"none","fromEnd":"arrow"}
\t],
\t"meta":{"version":"1.0"}
}
`;
