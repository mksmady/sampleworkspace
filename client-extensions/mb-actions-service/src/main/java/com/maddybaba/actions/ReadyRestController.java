package com.maddybaba.actions;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Readiness check used by Liferay (excluded from OAuth in application-default.properties).
 */
@RequestMapping("/ready")
@RestController
public class ReadyRestController {

	@GetMapping
	public String get() {
		return "READY";
	}

}
