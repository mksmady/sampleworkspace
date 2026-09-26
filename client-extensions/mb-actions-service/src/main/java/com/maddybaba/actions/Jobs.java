package com.maddybaba.actions;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.time.YearMonth;
import java.time.ZoneId;
import java.util.HashMap;
import java.util.Map;

import org.json.JSONObject;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.scheduling.annotation.EnableScheduling;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * Scheduled jobs (docs/data-model.md 7.3), in IST. Run a single instance of the service: jobs are not
 * coordinated between instances. With mb.jobs.run-on-startup=true (MB_JOBS_RUN_ON_STARTUP) every job
 * also runs once when the service starts, which is how they're tested locally.
 */
@Component
@EnableScheduling
public class Jobs {

	public Jobs(
		LiferayClient liferayClient, ListingRefresher listingRefresher, Recommender recommender, WeatherRefresher weatherRefresher,
		WorkflowApprover workflowApprover, @Value("${mb.jobs.run-on-startup}") boolean runOnStartup) {

		_liferayClient = liferayClient;
		_listingRefresher = listingRefresher;
		_recommender = recommender;
		_weatherRefresher = weatherRefresher;
		_workflowApprover = workflowApprover;
		_runOnStartup = runOnStartup;
	}

	/**
	 * Daily: commissions become available, hosts' earningsThisMonth, listings' nextAvailableDate.
	 */
	@Scheduled(cron = "${mb.jobs.daily-cron}", zone = "Asia/Kolkata")
	public void daily() {
		_run("commissions available", this::_commissionsAvailable);
		_run("earnings this month", this::_earningsThisMonth);
		_run("listings next available date", this::_listings);
	}

	/**
	 * Nightly: weather first, since recommendations use it.
	 */
	@Scheduled(cron = "${mb.jobs.nightly-cron}", zone = "Asia/Kolkata")
	public void nightly() {
		_run("weather", _weatherRefresher::refresh);
		_run("recommendations", _recommender::refresh);
	}

	@EventListener(ApplicationReadyEvent.class)
	public void onStartup() {
		if (_runOnStartup) {
			new Thread(
				() -> {
					daily();
					nightly();
					_log.info("JOBS startup run finished");
				},
				"mb-jobs-startup"
			).start();
		}
	}

	/**
	 * A pending commission becomes available once its booking is completed and availableOn has passed.
	 */
	private int _commissionsAvailable() {
		String today = LocalDate.now(_IST).toString();
		Map<Long, String> bookingStatuses = new HashMap<>();
		int changed = 0;

		for (JSONObject commission : _liferayClient.getAll("/o/c/commissions")) {
			String availableOn = commission.optString("availableOn");
			long bookingId = commission.optLong("r_bookingCommissions_c_bookingId", 0);

			if (!"pending".equals(_key(commission.opt("commissionStatus"))) || (availableOn.length() < 10) ||
				(availableOn.substring(0, 10).compareTo(today) > 0) || (bookingId <= 0)) {

				continue;
			}

			String bookingStatus = bookingStatuses.computeIfAbsent(
				bookingId, id -> _key(_liferayClient.get("/o/c/bookings/" + id).opt("bookingStatus")));

			if ("completed".equals(bookingStatus)) {
				_liferayClient.patch("/o/c/commissions/" + commission.getLong("id"), new JSONObject().put("commissionStatus", "available"));
				changed++;
			}
		}

		return changed;
	}

	/**
	 * earningsThisMonth = the host's commissions created this month (IST), reversed ones excluded.
	 * Hosts go through review on every update, so the service approves its own update of approved hosts.
	 */
	private int _earningsThisMonth() {
		YearMonth month = YearMonth.now(_IST);
		Map<Long, BigDecimal> earnings = new HashMap<>();

		for (JSONObject commission : _liferayClient.getAll("/o/c/commissions")) {
			String dateCreated = commission.optString("dateCreated");

			if (!"reversed".equals(_key(commission.opt("commissionStatus"))) && !dateCreated.isEmpty() &&
				YearMonth.from(Instant.parse(dateCreated).atZone(_IST)).equals(month)) {

				earnings.merge(commission.optLong("r_hostCommissions_c_hostId", 0), Money.of(commission.opt("amount")), BigDecimal::add);
			}
		}

		int changed = 0;

		for (JSONObject host : _liferayClient.getAll("/o/c/hosts")) {
			BigDecimal value = earnings.getOrDefault(host.getLong("id"), BigDecimal.ZERO.setScale(2));

			if (!Money.same(value, host.opt("earningsThisMonth"))) {
				boolean wasApproved = host.optJSONObject("status").optInt("code", -1) == 0;

				_liferayClient.patch("/o/c/hosts/" + host.getLong("id"), new JSONObject().put("earningsThisMonth", value));

				if (wasApproved) {
					_workflowApprover.approveAutomaticUpdate(host.getLong("id"));
				}

				changed++;
			}
		}

		return changed;
	}

	private static String _key(Object picklistValue) {
		if (picklistValue instanceof JSONObject jsonObject) {
			return jsonObject.optString("key");
		}

		return (picklistValue == null) ? "" : picklistValue.toString();
	}

	/**
	 * Dates pass without any slot changing, so every listing's nextAvailableDate is refreshed daily.
	 */
	private int _listings() {
		int count = 0;

		for (JSONObject listing : _liferayClient.getAll("/o/c/listings")) {
			_listingRefresher.refresh(listing.getLong("id"));
			count++;
		}

		return count;
	}

	private void _run(String name, Job job) {
		try {
			_log.info("JOB {} done: {}", name, job.run());
		}
		catch (Exception exception) {
			_log.error("JOB {} failed", name, exception);
		}
	}

	private static final ZoneId _IST = ZoneId.of("Asia/Kolkata");

	private static final Logger _log = LoggerFactory.getLogger(Jobs.class);

	private final LiferayClient _liferayClient;
	private final ListingRefresher _listingRefresher;
	private final Recommender _recommender;
	private final boolean _runOnStartup;
	private final WeatherRefresher _weatherRefresher;
	private final WorkflowApprover _workflowApprover;

	@FunctionalInterface
	private interface Job {

		int run() throws Exception;

	}

}
