const express = require("express")
const router = express.Router()
const protect = require("../middlewares/auth.middleware")
const ctrl = require("../controllers/swarm.controllers")

router.use(protect)

// Create lobby
router.post("/", ctrl.createSwarm)
// Get
router.get("/:swarmId", ctrl.getSwarm)
// Join
router.post("/:swarmId/join", ctrl.joinSwarm)
// Start
router.post("/:swarmId/start", ctrl.startSwarm)
router.post("/:swarmId/phase", ctrl.setPhase)
// Ideas
router.post("/:swarmId/ideas", ctrl.addIdea)
// Clusters
router.post("/:swarmId/clusters", ctrl.clusterIdeas)
// Vote
router.post("/:swarmId/ideas/:ideaId/vote", ctrl.voteIdea)
// Actions
router.post("/:swarmId/actions", ctrl.setActions)
// End
router.post("/:swarmId/end", ctrl.endSwarm)
// List by group
router.get("/group/:groupId", ctrl.listGroupSwarms)
router.get("/group/:groupId/outcomes", ctrl.listGroupOutcomes)

module.exports = router

