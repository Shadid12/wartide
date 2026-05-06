I am creating an RTS game simmilar to warcraft 2. It will be 2d and playable in the browser. We are going to Phaser 3 for this. Create the basic structure. First create the map and the minimap. Create some terrians and resources also. we will have 3 resources just like warcraft 2. Gold, wood and oil.

Next let's add some units. We will add only workers unit for now. Workers should be selectable. Player can select multiple workers at once. And you can point and click in the map to mave the workers. 

workers should have the ability to collect resources. When you select a worker or multiple workers you can click on a resourse like tree and the worker will start collecting it. A worker takes 10 seconds to collect 20 wood from a tree.

When the worker collects 20 woods he will go back to the town center to drop it off and only then the wood count updates.

When workers collecting wood. The tree's wood amount should also reduce.

When a tree has less than 1200 wood it will have the following sprite. Workers will be able to walk over this tile at this point.

We need the functionality to add a rallying point from the townhall so the works rally in that point.

when I unselect the town hall the rally flag will disappear from the map.

Workers should be able to collect gold. 

+20 gold text should be gold color

'/Users/shadid/Documents/shadid/wartide/assets/sprites/worker/worker_run_Gold.png' Use this animation when worker is carrying gold back to townhall

Make the tree generation more spread apart.

Now remove the cyan line as I am done debuggin

When I select a worker I should see building options. I can build a farm or a barrack.

When I try to place a barrack it says not enough resource.

Add a third type of building Tower. 

When worker is building a building the worker needs to go near that area. It will take 60 seconds to build a Tower
for the worker

Let's make Tower a new entity.