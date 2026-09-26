package com.maddybaba.actions;

import org.json.JSONObject;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import org.springframework.stereotype.Component;

/**
 * Every update to a Listing sends it back for review (MB Ops Approval). When the service changes only
 * derived fields of a listing that was approved, it approves the resulting review task itself, so the
 * listing stays live (docs/data-model.md 6.4). Host edits are never approved here.
 */
@Component
public class WorkflowApprover {

	public WorkflowApprover(LiferayClient liferayClient) {
		_liferayClient = liferayClient;
	}

	public void approveAutomaticUpdate(long entryId) {

		// Liferay starts the workflow asynchronously after the save, so the task can take a moment.

		for (int attempt = 0; attempt < 30; attempt++) {
			for (JSONObject task : _liferayClient.getAll(_TASKS + "/assigned-to-my-roles")) {
				JSONObject objectReviewed = task.optJSONObject("objectReviewed");

				if ((objectReviewed != null) && (objectReviewed.optLong("id") == entryId)) {
					long taskId = task.getLong("id");

					_liferayClient.post(_TASKS + "/" + taskId + "/assign-to-me", new JSONObject());
					_liferayClient.post(
						_TASKS + "/" + taskId + "/change-transition",
						new JSONObject().put("comment", _COMMENT).put("transitionName", "approve"));

					_log.info("Approved automatic update of entry {} (task {})", entryId, taskId);

					return;
				}
			}

			try {
				Thread.sleep(500);
			}
			catch (InterruptedException interruptedException) {
				Thread.currentThread().interrupt();

				return;
			}
		}

		_log.warn("No review task found for entry {}; it stays pending for Ops", entryId);
	}

	private static final String _COMMENT = "Automatic update by mb-actions-service (derived fields only).";

	private static final String _TASKS = "/o/headless-admin-workflow/v1.0/workflow-tasks";

	private static final Logger _log = LoggerFactory.getLogger(WorkflowApprover.class);

	private final LiferayClient _liferayClient;

}
