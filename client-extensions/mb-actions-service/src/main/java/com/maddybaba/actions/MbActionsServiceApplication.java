package com.maddybaba.actions;

import com.liferay.client.extension.util.spring.boot3.ClientExtensionUtilSpringBootComponentScan;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.context.annotation.Import;

/**
 * Object action and validation handlers for Maddybaba (docs/data-model.md sections 5 and 7).
 */
@Import(ClientExtensionUtilSpringBootComponentScan.class)
@SpringBootApplication
public class MbActionsServiceApplication {

	public static void main(String[] args) {
		SpringApplication.run(MbActionsServiceApplication.class, args);
	}

}
